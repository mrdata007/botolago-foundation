-- A manager's change that passed the deadline check cannot commit after the gameweek is locked
-- (audit finding SEC-01, second gap, 2026-10-16).
--
-- THE DEFECT (reproduced on PostgreSQL 16 with the real functions, two sessions). Every manager write
-- checks the deadline against statement_timestamp(), the moment the call started, and reads the
-- gameweek without a lock: app_private.fantasy_assert_mutable_gameweek (save_fantasy_lineup,
-- preview/confirm_fantasy_transfers, activate/cancel_fantasy_chip) and, for a new squad,
-- app_private.fantasy_enrolment_gameweek (create_fantasy_team). The lock step
-- (api.service_advance_fantasy_lifecycle, at the deadline) takes the gameweek row FOR UPDATE, locks the
-- lineups it can see, and moves the gameweek to 'locked' once none is left. Nothing made a call that
-- started before the deadline finish before that. So:
--   * create_fantasy_team started before the deadline, the lock step ran and committed, then the squad
--     committed: its lineup is unlocked in a 'locked' gameweek. The lock step never runs on a 'locked'
--     gameweek again, the manager can no longer touch it (fantasy_gameweek_locked), and
--     api.service_get_fantasy_scoring_snapshot refuses the gameweek on every pass with
--     fantasy_lineup_not_locked: the gameweek cannot be scored or finalized. The window is the time the
--     call takes from its start to its first insert (whose foreign key check takes KEY SHARE on the
--     gameweek and so does wait for a lock step already holding it); it is milliseconds when idle and
--     grows with load, or with any wait inside the call (its two advisory locks).
--   * activate_fantasy_chip / cancel_fantasy_chip the same way: the chip change commits after the
--     gameweek is 'locked' and is scored (the snapshot reads chip uses when it is taken); no guard sees it.
--   * save_fantasy_lineup on an existing lineup and confirm_fantasy_transfers were already safe: their
--     write re-reads the lineup row (locked_at is null) under its row lock and is refused once the lock
--     step has locked it.
--
-- THE FIX. Both checks now take FOR KEY SHARE on the gameweek row and look again at what the lock returns;
-- FOR UPDATE (the lock step) conflicts with FOR KEY SHARE. So a call either holds the row first (the lock
-- step waits for its commit, then sees its lineup and locks it) or waits for the lock step and is refused
-- with the long-standing fantasy_gameweek_locked. Same refusals, same codes, same deadline: the deadline
-- is still the moment the call started (statement_timestamp()), and nothing that was accepted before is
-- refused now unless the lock step committed while it was running.
--   1. app_private.fantasy_assert_mutable_gameweek(uuid): first the same unlocked check as before (a call
--      after the deadline is refused without taking any lock, so a stream of late calls cannot hold the
--      lock step off), then FOR KEY SHARE and the same check again. It becomes VOLATILE (a row lock is not
--      allowed in a STABLE function). In a READ ONLY transaction (PostgREST runs the STABLE
--      api.preview_fantasy_transfers that way) it takes no lock: such a transaction cannot write, so it
--      cannot race the lock step, and FOR KEY SHARE would be an error there.
--   2. api.create_fantasy_team: after its two advisory locks (the order it already had: its foreign keys
--      took KEY SHARE on the gameweek after them), FOR KEY SHARE on the gameweek it joins, then
--      app_private.fantasy_enrolment_gameweek again; a different answer is fantasy_gameweek_locked, as at
--      the top of the function. Otherwise byte for byte the definition of 20260926003100.
-- No other function, table, trigger, grant or setting changes; the lock step, the scoring snapshot and every
-- Fantasy rule are as they were. CREATE OR REPLACE keeps both functions' owners and grants.
--
-- LOCK ORDER. save_fantasy_lineup, activate_fantasy_chip and cancel_fantasy_chip take the new lock before
-- anything else (then the team row, then the lineup); create_fantasy_team takes it after its advisory locks
-- and before its inserts; confirm_fantasy_transfers takes it in preview, after the team row, where its
-- transfer-batch insert already took KEY SHARE on the same row. Every function that locks a gameweek row
-- FOR UPDATE takes it first (after the calendar advisory lock at most); none waits for a team or lineup row
-- a manager holds while holding the open gameweek row except the lock step's lineup FOR UPDATE, which a
-- manager only takes after the gameweek row. KEY SHARE does not conflict with KEY SHARE, so the managers do
-- not queue behind one another on the gameweek row, nor behind the lifecycle's plain status updates
-- (FOR NO KEY UPDATE); they wait only while a FOR UPDATE holder (a lifecycle step on the open gameweek, the
-- calendar sync) runs, and the lock step waits only for the calls already holding the row.
--
-- LEFT AS IT IS. Between two lock-step pages (only when a single call does not lock every lineup: the
-- worker's pages; the pg_cron tick runs up to 20 pages in one transaction), the gameweek is still 'open'
-- and a call that started before the deadline can still change a chip of a team whose lineup the first
-- page already locked. It is scored consistently (the snapshot reads chips when it is taken) and the
-- request started before the deadline; lineup saves and transfers are refused there by their lineup check.
--
-- Applying it writes no data. Forward-only; to take it back, a new migration restores the two definitions
-- of 20260720141854 (assert, STABLE) and 20260926003100 (create_fantasy_team).
--
-- Prerequisites: 20260720141854 (the mutability check), 20260924200000 (the enrolment gameweek),
-- 20260926003100 (create_fantasy_team as replaced here).
do $$
begin
  if to_regprocedure('app_private.fantasy_assert_mutable_gameweek(uuid)') is null
    or to_regprocedure('app_private.fantasy_enrolment_gameweek(uuid)') is null
    or to_regprocedure('app_private.assert_mfa_step_up()') is null
    or to_regprocedure('api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)') is null then
    raise exception 'fantasy_deadline_mutation_lock: a prerequisite migration is missing';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. The mutability check locks the gameweek row it approves
-- ---------------------------------------------------------------------------
create or replace function app_private.fantasy_assert_mutable_gameweek(p_gameweek_id uuid)
returns app.fantasy_gameweeks
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare target app.fantasy_gameweeks%rowtype;
begin
  -- The check as before, without a lock: a call after the deadline is refused here.
  select * into target from app.fantasy_gameweeks where id = p_gameweek_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if target.status <> 'open' or statement_timestamp() >= target.deadline_at then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
  -- A read-only transaction cannot write, so it cannot commit after the lock step; it takes no lock.
  if pg_catalog.current_setting('transaction_read_only') = 'on' then
    return target;
  end if;
  -- Lock the row the lock step takes FOR UPDATE, then check what the lock returns.
  select * into target from app.fantasy_gameweeks where id = p_gameweek_id for key share;
  if not found then
    raise exception using errcode = 'PT404', message = 'fantasy_gameweek_not_found';
  end if;
  if target.status <> 'open' or statement_timestamp() >= target.deadline_at then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
  return target;
end;
$$;
comment on function app_private.fantasy_assert_mutable_gameweek(uuid) is
  'Refuses (PT409 fantasy_gameweek_locked) a manager change to a gameweek that is not open or whose deadline is not after the call''s start; otherwise holds FOR KEY SHARE on the gameweek row to the end of the transaction (not in a read-only transaction), so the lock step''s FOR UPDATE waits for the change to commit, and a change that waited for the lock step reads its result.';

-- ---------------------------------------------------------------------------
-- 2. A new squad locks the gameweek it joins (as in 20260926003100, plus the lock)
-- ---------------------------------------------------------------------------
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
  -- 20261016180000: lock the gameweek row the squad joins, then look again. The lock step
  -- (api.service_advance_fantasy_lifecycle) takes this row FOR UPDATE, which waits for this
  -- KEY SHARE, so the squad either commits before the lock step reads the lineups (and is
  -- locked with them) or waits for it; if the gameweek is then no longer the one a squad joins
  -- (it is 'locked'), the squad is refused here as at the top of the function.
  perform 1 from app.fantasy_gameweeks where id = gameweek.id for key share;
  gameweek := app_private.fantasy_enrolment_gameweek(season.id);
  if gameweek.id is null or gameweek.id <> requested.id then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
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
