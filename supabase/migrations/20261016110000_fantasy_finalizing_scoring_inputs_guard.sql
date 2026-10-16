-- A finalizing gameweek's scoring inputs cannot change underneath it (audit finding SEC-01, 2026-10-16).
--
-- THE DEFECT. A gameweek in status 'finalizing' has its scoring snapshot sealed. Every later pass of
-- api.service_finalize_fantasy_team_results / api.service_complete_fantasy_gameweek recomputes the
-- scoring input document (app_private.fantasy_scoring_input_document) and
-- app_private.fantasy_assert_scoring_snapshot raises fantasy_scoring_input_changed when its sha256 no
-- longer equals the sealed one; a new snapshot is refused while the gameweek is 'finalizing'
-- (fantasy_scoring_snapshot_missing). So one change to what the document lists, while the gameweek is
-- 'finalizing', leaves it unable to complete.
--
-- Nothing stopped such a change. The one that happens on its own is the SofaScore matcher:
-- api.service_sofascore_auto_map_players (called by football-live-refresh every minute, no lease)
-- creates a player nobody had (app_private.sofascore_create_catalog_player: app.players, his
-- app.team_memberships row and his app.fantasy_players pool entry). The pool entry is one more row in
-- the document's "players" list. fantasy_guard_unfinished_price_catalog (20261009091728) and its close
-- variant (20261013160200) refuse catalog changes only between price pages of a finalized or closed
-- gameweek, never while it is 'finalizing'; api.service_apply_current_player_list refuses
-- (fantasy_gameweek_finalizing) but the matcher, the staff action "create this player" and account
-- erasure do not go through it.
--
-- WHAT THE DOCUMENT READS (read from the latest definitions, chain: 20260926101555 base, patched in
-- place by 20261011180000, wrapped by 20260927094823 / 20260927120659 adaptive, 20260927140000 and
-- 20260927145230 live, 20261014090000 ratings). The rows that can change it, among the tables this
-- migration is about:
--   app.fantasy_players       every row of the fantasy season, no filter: id, football_player_id,
--                             football_team_id, position_id (through app.fantasy_positions.code).
--                             price, status, eligible, active, selected_by_count, price_version,
--                             created_at, updated_at are NOT read.
--   app.team_memberships      adaptive documents only: a pool player's membership of the match's
--                             season with team_id in (home, away) and valid_from / valid_to around the
--                             kick-off date. shirt_number, squad_role and active are NOT read.
--   app.fantasy_lineups       lineupCount and the lineups digest of the gameweek (with their players,
--                             chip and transfer hit).
--
-- WHAT THIS MIGRATION ADDS. While ANY gameweek of the same Fantasy season has status 'finalizing', three
-- row triggers refuse with errcode PT409, message fantasy_scoring_inputs_frozen:
--   1. app.fantasy_players: INSERT, DELETE, and UPDATE of id, fantasy_season_id, football_player_id,
--      football_team_id or position_id (the five columns the two existing price guards already watch,
--      of which four feed the document). An UPDATE that leaves those five unchanged passes, so price,
--      status, eligible, active and every other column stay writable.
--   2. app.team_memberships: INSERT, DELETE, and UPDATE of player_id, team_id, season_id, valid_from or
--      valid_to, but only for a membership of a player who is in that Fantasy season's pool and whose
--      season_id is the Fantasy season's football season (old and new row both looked at). A shirt
--      number, a squad role, the active flag, and any membership of a player outside the pool, stay
--      writable.
--   3. app.fantasy_lineups: DELETE of a lineup of the finalizing gameweek. The only code that does this
--      is app_private.account_deletion_erase (an account erased in the middle of a finalization would
--      change lineupCount and the digest, the same way). The erasure runs in one transaction, so the
--      refusal undoes all of it, and account-deletion-worker already releases a request whose erasure
--      is refused and tries again at the next hourly pass (api.service_release_account_deletion keeps
--      the message as the request's last_error). INSERT and UPDATE of lineups are not touched:
--      managers' lineups are locked at the deadline, long before 'finalizing'.
-- It adds no column, table, index, setting or grant, and changes no existing function or trigger.
--
-- WHAT IT DOES NOT BLOCK. Anything while no gameweek of the season is 'finalizing'. Price changes, status,
-- eligibility and active flags, photos, names, shirt numbers, positions on app.players (the document
-- reads the Fantasy position, not that one), memberships of players outside the pool, the weekly
-- SofaScore catalog (names, positions of app.players, shirt numbers: none feeds the document), and every
-- existing guard, which keeps its own error and fires first where it applies (the trigger names below
-- sort after fantasy_players_enforce_rules, whose fantasy_gameweek_locked answer for a position change
-- is therefore still the one given).
--
-- THE SOFASCORE MATCHER HOLDS INSTEAD OF FAILING. Its creation of a player is a BEGIN ... EXCEPTION WHEN
-- OTHERS block in api.service_sofascore_auto_map_players (20261014170000): the refusal undoes the player,
-- his membership and his pool entry, counts one in createFailed, leaves him queued ('no_candidate'), and
-- the rest of the batch and of the live refresh go on. The matcher is called again for the match on the
-- next live refresh or held-fixture retry; once the gameweek leaves 'finalizing' he is created. The
-- matcher is not changed. The staff action api.admin_sofascore_create_player gets the refusal as an
-- error and can be repeated after the gameweek is finalized. The current player-list update keeps its
-- own earlier refusal (fantasy_gameweek_finalizing).
--
-- THE RACE, AND THE LOCK THAT CLOSES IT. A check that only read the status would leave a window: a writer
-- that saw 'provisional' could still commit after the gameweek turned 'finalizing'. So each trigger first
-- takes FOR KEY SHARE on the season's current gameweek row (status open, locked, live, provisional or
-- finalizing: at most one per season, fantasy_gameweeks_one_current_idx) and only then looks at the status
-- that lock returns. api.service_begin_fantasy_finalization, the only function that moves a gameweek to
-- 'finalizing', locks that row FOR UPDATE, then recomputes the scoring input document and moves the status
-- in the same transaction, and FOR UPDATE conflicts with FOR KEY SHARE. So either the writer holds the lock
-- first (the finalization waits for the writer's commit and then recomputes the document with the writer's
-- row in it: the seal is right, or refused cleanly with fantasy_scoring_input_changed while the gameweek is
-- still provisional), or the finalization holds it first (the writer waits, then reads 'finalizing' and
-- refuses). FOR KEY SHARE does not block readers, other KEY SHARE holders, or a plain UPDATE of the row (the
-- lifecycle's ordinary status and counter updates); only a FOR UPDATE waits, and only for the writer's
-- transaction. A matcher block that is refused releases it with its savepoint.
--
-- LOCK ORDER. A writer takes its table lock (at statement start), then this row. The lifecycle takes the
-- calendar advisory lock, then gameweek rows, then assignments and fixtures; the price batches take their
-- lock on app.fantasy_players before the gameweek row, so a writer queues behind a batch before it holds
-- the gameweek row, and a batch queues behind a writer that already holds it (checked with two sessions on
-- PostgreSQL 16: no deadlock). The one cycle left is a long catalog write that holds pool-row locks
-- against a lifecycle step that holds the gameweek row and updates the same pool rows (the player-list
-- update, which requires the lifecycle tick paused): PostgreSQL detects it and ends one side, and the
-- matcher holds the player and retries, the worker retries. The membership trigger takes the lock only for a
-- player who is in a pool (one lookup for every other membership).
--
-- Applying it writes no data. Forward-only; roll back with a migration that drops the three triggers
-- and three functions.
--
-- Prerequisites: 20260720141826 (fantasy_players), 20260720095330 (team_memberships), 20260720141847
-- (fantasy_lineups), 20261009091728 and 20261013160200 (the existing guards).
do $$
begin
  if to_regclass('app.fantasy_players') is null
    or to_regclass('app.fantasy_gameweeks') is null
    or to_regclass('app.fantasy_seasons') is null
    or to_regclass('app.team_memberships') is null
    or to_regclass('app.fantasy_lineups') is null
    or to_regprocedure('app_private.fantasy_guard_unfinished_price_catalog()') is null
    or to_regprocedure('app_private.fantasy_guard_unfinished_close_price_catalog()') is null
    or to_regprocedure('app_private.fantasy_scoring_input_document(uuid)') is null
    or to_regprocedure('app_private.sofascore_create_catalog_player(uuid,uuid,text,integer,text)') is null then
    raise exception 'fantasy_finalizing_scoring_inputs_guard: a prerequisite migration is missing';
  end if;
  if to_regprocedure('app_private.fantasy_guard_finalizing_player_catalog()') is not null
    or to_regprocedure('app_private.fantasy_guard_finalizing_squad_membership()') is not null
    or to_regprocedure('app_private.fantasy_guard_finalizing_lineups()') is not null then
    raise exception 'fantasy_finalizing_scoring_inputs_guard: the guard already exists';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. The Fantasy player pool
-- ---------------------------------------------------------------------------
create function app_private.fantasy_guard_finalizing_player_catalog()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_season uuid;
  new_season uuid;
  week_status app.fantasy_gameweek_status;
begin
  if TG_OP = 'UPDATE' and row(old.id, old.fantasy_season_id, old.football_player_id,
      old.football_team_id, old.position_id) is not distinct from
    row(new.id, new.fantasy_season_id, new.football_player_id, new.football_team_id, new.position_id) then
    return new;
  end if;
  if TG_OP <> 'INSERT' then old_season := old.fantasy_season_id; end if;
  if TG_OP <> 'DELETE' then new_season := new.fantasy_season_id; end if;
  -- Lock the current gameweek row(s) of the season(s) first, then read the status the lock returns.
  for week_status in
    select gw.status from app.fantasy_gameweeks gw
    where gw.fantasy_season_id in (old_season, new_season)
      and gw.status in ('open', 'locked', 'live', 'provisional', 'finalizing')
    order by gw.id
    for key share
  loop
    if week_status = 'finalizing' then
      raise exception using errcode = 'PT409', message = 'fantasy_scoring_inputs_frozen',
        detail = 'app.fantasy_players: a gameweek of this Fantasy season is finalizing and its scoring snapshot is sealed',
        hint = 'Retry once the gameweek is finalized.';
    end if;
  end loop;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.fantasy_guard_finalizing_player_catalog()
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_guard_finalizing_player_catalog() is
  'Refuses (PT409 fantasy_scoring_inputs_frozen) an insert, a delete or a change of season, player, club or position of a Fantasy pool row while a gameweek of its season is finalizing: those rows are the scoring input document''s player list.';
create trigger fantasy_players_guard_finalizing_inputs
before insert or delete or update of id, fantasy_season_id, football_player_id, football_team_id, position_id
on app.fantasy_players for each row execute function app_private.fantasy_guard_finalizing_player_catalog();

-- ---------------------------------------------------------------------------
-- 2. The club memberships of pool players
-- ---------------------------------------------------------------------------
create function app_private.fantasy_guard_finalizing_squad_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_player uuid;
  old_season uuid;
  new_player uuid;
  new_season uuid;
  pool_seasons uuid[];
  pool_season uuid;
  week_status app.fantasy_gameweek_status;
begin
  if TG_OP = 'UPDATE' and row(old.player_id, old.team_id, old.season_id, old.valid_from, old.valid_to)
      is not distinct from row(new.player_id, new.team_id, new.season_id, new.valid_from, new.valid_to) then
    return new;
  end if;
  if TG_OP <> 'INSERT' then old_player := old.player_id; old_season := old.season_id; end if;
  if TG_OP <> 'DELETE' then new_player := new.player_id; new_season := new.season_id; end if;
  -- Only a player who is in a pool matters, and almost every membership is not: one cheap lookup finds
  -- the Fantasy seasons of the old and of the new row whose pool holds him (none: nothing more to do).
  select array_agg(x.id order by x.id) into pool_seasons from (
    select fs.id from app.fantasy_seasons fs
    where fs.football_season_id = old_season
      and exists (select 1 from app.fantasy_players fp
                  where fp.fantasy_season_id = fs.id and fp.football_player_id = old_player)
    union
    select fs.id from app.fantasy_seasons fs
    where fs.football_season_id = new_season
      and exists (select 1 from app.fantasy_players fp
                  where fp.fantasy_season_id = fs.id and fp.football_player_id = new_player)
  ) x;
  if pool_seasons is not null then
    -- In a fixed order: lock each one's current gameweek row, then read the status the lock returns.
    foreach pool_season in array pool_seasons loop
      for week_status in
        select gw.status from app.fantasy_gameweeks gw
        where gw.fantasy_season_id = pool_season
          and gw.status in ('open', 'locked', 'live', 'provisional', 'finalizing')
        order by gw.id
        for key share
      loop
        if week_status = 'finalizing' then
          raise exception using errcode = 'PT409', message = 'fantasy_scoring_inputs_frozen',
            detail = 'app.team_memberships: the player is in the pool of a Fantasy season with a finalizing gameweek and its scoring snapshot is sealed',
            hint = 'Retry once the gameweek is finalized.';
        end if;
      end loop;
    end loop;
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.fantasy_guard_finalizing_squad_membership()
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_guard_finalizing_squad_membership() is
  'Refuses (PT409 fantasy_scoring_inputs_frozen) an insert, a delete or a change of player, club, season or validity dates of the membership of a Fantasy pool player while a gameweek of that Fantasy season is finalizing: adaptive scoring input documents read those columns.';
create trigger team_memberships_guard_finalizing_inputs
before insert or delete or update of player_id, team_id, season_id, valid_from, valid_to
on app.team_memberships for each row execute function app_private.fantasy_guard_finalizing_squad_membership();

-- ---------------------------------------------------------------------------
-- 3. The lineups of the finalizing gameweek (account erasure)
-- ---------------------------------------------------------------------------
create function app_private.fantasy_guard_finalizing_lineups()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  week_status app.fantasy_gameweek_status;
begin
  for week_status in
    select gw.status from app.fantasy_gameweeks gw
    where gw.id = old.gameweek_id
      and gw.status in ('open', 'locked', 'live', 'provisional', 'finalizing')
    for key share
  loop
    if week_status = 'finalizing' then
      raise exception using errcode = 'PT409', message = 'fantasy_scoring_inputs_frozen',
        detail = 'app.fantasy_lineups: the gameweek is finalizing and its scoring snapshot is sealed',
        hint = 'Retry once the gameweek is finalized.';
    end if;
  end loop;
  return old;
end;
$$;
revoke all on function app_private.fantasy_guard_finalizing_lineups()
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_guard_finalizing_lineups() is
  'Refuses (PT409 fantasy_scoring_inputs_frozen) the deletion of a lineup of a finalizing gameweek: lineupCount and the lineups digest are part of the sealed scoring input document. Account erasure is the only deleter; it is released and retried by the worker.';
create trigger fantasy_lineups_guard_finalizing_inputs
before delete on app.fantasy_lineups
for each row execute function app_private.fantasy_guard_finalizing_lineups();
