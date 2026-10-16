-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261016110000_fantasy_finalizing_scoring_inputs_guard
-- (audit finding SEC-01, 2026-10-16; docs/production/FANTASY_FINALIZING_GUARD_OWNER_RUNBOOK.md):
-- While a gameweek of a Fantasy season is FINALIZING, the rows its scoring input document lists can no
-- longer change. Three row triggers refuse, with errcode PT409 and message fantasy_scoring_inputs_frozen:
--   * app.fantasy_players: insert, delete, and a change of season, player, club or position;
--   * app.team_memberships: insert, delete, and a change of player, club, season or dates, for a player
--     who is in that Fantasy season's pool;
--   * app.fantasy_lineups: delete (account erasure; the worker releases the request and retries hourly).
-- Why: the SofaScore matcher (football-live-refresh, every minute, no lease) creates a player nobody had,
-- with his pool entry; that is one more row in the sealed document, so every later finalization pass
-- fails with fantasy_scoring_input_changed and the gameweek can never complete. Price, status, eligible,
-- active, shirt numbers, names, photos, and every write while no gameweek is finalizing, stay as they are.
-- Each trigger first takes FOR KEY SHARE on the season's current gameweek row, which the finalization's
-- FOR UPDATE on the same row conflicts with, so a writer cannot commit after the gameweek has been sealed:
-- it either commits first (the finalization then sees its row) or waits and is refused.
-- The matcher is not changed: it creates a player inside a BEGIN ... EXCEPTION WHEN OTHERS block, so the
-- refusal undoes that one player, counts createFailed, leaves him queued, and the rest of the batch and
-- of the live refresh go on; the next call creates him once the gameweek is no longer finalizing.
-- It adds three functions and three triggers and writes no data. It replaces no function and changes no
-- existing trigger, table, column, setting, job or privilege.
--
-- WHEN
--   Any time of day, once the writers named below are paused; the statements need well under a second.
--   It needs 20260927094823, 20261009091728, 20261013160200 and 20261014170000 recorded (the script
--   checks). A gameweek that is finalizing at the moment this commits is protected from then on: a
--   change made before it committed is NOT undone, so look first (read-only):
--     select g.id, g.sequence_number, g.status from app.fantasy_gameweeks g where g.status = 'finalizing';
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   This changes the guards on app.fantasy_players, app.team_memberships and app.fantasy_lineups, which the
--   Fantasy lifecycle, the SofaScore live refresh and account erasure write. Creating a trigger takes a short lock that
--   waits for them, and the 5 second lock timeout below stops the script instead of queueing behind them.
--   So the script STOPS, before writing anything, unless these three are paused:
--   * the Fantasy lifecycle tick and, with it, the Fantasy worker tick (fantasy-lifecycle-tick,
--     fantasy-worker-tick; they score, lock, finalize and write prices and lineups). First look at
--     select lifecycle_tick_enabled from app_private.fantasy_automation_settings;
--     then pause: select app_private.fantasy_automation_configure(false);
--     Pausing does not stop a pass already started: it keeps its lease for at most about eight minutes,
--     so wait until select holder, expires_at, released_at from app_private.fantasy_worker_lease;
--     shows released_at set or expires_at in the past (the script checks this too);
--   * football-live-refresh (every minute; its SofaScore matcher creates players and memberships). First
--     look at select mode, test_user_ids, football_live_refresh_enabled from
--     app_private.notification_email_settings; then pause:
--     select app_private.notification_email_configure('off', null, null, false);
--     (this also stands down the e-mail and results jobs and the season refresh; write down what the
--     first query showed, it is what you restore).
--   * the account-deletion tick (hourly at minute 23; its erasure deletes lineups, which the new lineup
--     trigger guards, and its lineup deletes would queue behind the trigger's lock). First look at
--     select enabled from app_private.account_deletion_settings;
--     then pause: select app_private.account_deletion_configure(false);
--     (the script checks the switch; a request that falls due meanwhile simply waits).
--   Optional, and why: AGENTS.md also lists Pépites ("a write that touches ... team memberships") and the
--   Manager Card ("a write that touches ... lineups"). This script writes no row of any table: it adds
--   triggers, and both jobs only READ these tables (their own tables are written elsewhere); a new trigger
--   takes a lock that does not block a reader. So they need not be paused. If you prefer the strict
--   reading, the commands are: look at select mode from app_private.pepites_settings; then
--   select app_private.pepites_configure('off', null); and select app_private.manager_card_configure(false, null);
--   and restore the previous Pépites mode and select app_private.manager_card_configure(true, null); only
--   if compute was on. Not needed either: managers' own lineup edits (ordinary traffic, a moment's lock),
--   the Trophées and Rivaux ticks (they read these tables), and the news and prediction jobs (other tables).
--   Restore AFTER the commit, and only what was on: select app_private.fantasy_automation_configure(true);
--   select app_private.account_deletion_configure(true); and
--   select app_private.notification_email_configure('<mode it showed>', null, <test_user_ids it
--   showed, or null>, <football_live_refresh_enabled it showed>);
--   While paused nothing is scored or finalized and no match is recorded; a few minutes is harmless.
--   Still make sure no other schema change (another apply script, a migration, a deploy) is running right
--   now: a rehearsal that ends in rollback takes locks too. The script compares the six functions it
--   relies on, every other trigger on the three tables, the row counts of the three tables and the cron job
--   list before and after and stops if they moved.
--
-- HOW TO RUN
--   0. Supabase dashboard -> project "BotolaGO Production V2" (the address contains
--      tkewgajrljbwgwedqsxn; the database holds no project name this script could check, so look
--      at the address) -> SQL Editor -> New query. Pause the three writers above first.
--   1. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one transaction, checked, and
--      then ROLLED BACK. The result row should say "Rehearsal passed".
--   2. Change the line `rollback;` near the bottom to `commit;` and press Run again. The result
--      row should say "Applied". Then restore what you paused (above).
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects. Send the message.
--   To take it back: ship a forward migration that drops the three triggers and then the three functions
--   (docs/production/FANTASY_FINALIZING_GUARD_OWNER_RUNBOOK.md, "Rolling back"). Never edit this migration.
--
-- WHAT IT DOES
--   * refuses to run twice (history row, or any of the three functions or triggers already there), before
--     the four migrations above are recorded, while the Fantasy lifecycle tick, the live refresh or the
--     account-deletion tick is on or the Fantasy worker holds its lease, and where any of the six
--     functions it relies on is not byte for byte the text the repository's latest migration defines (md5 of its source): the two
--     price-processing guards, the pool rule trigger, the snapshot check, the catalog-player creation
--     and the SofaScore matcher;
--   * refuses to run where the scoring input document functions no longer read the Fantasy pool, the
--     club memberships and the lineups, or read another player table this guard does not cover;
--   * records the migration file in supabase_migrations.schema_migrations, whole as statements[1]
--     (the form the migration promoter and the other apply scripts use), and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: the three functions are the reviewed text, security
--     definer, empty search path, callable by no API role; the three triggers are on the right tables,
--     BEFORE ROW, enabled, on the right events and columns; the six functions, every other trigger on the
--     three tables, the row counts and the cron job list are where they were; the history row is there.
--     It does not insert, update or delete a row of any of the three tables.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  fn record;
  src text;
  document_src text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261016110000') then
    raise exception 'stop: migration 20261016110000 is already recorded as applied';
  end if;
  for fn in select v.version from unnest(array['20260927094823', '20261009091728', '20261013160200', '20261014170000']) as v(version) loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = fn.version) then
      raise exception 'stop: migration % is not recorded -- apply it first (this update is written against it)', fn.version;
    end if;
  end loop;
  if to_regclass('app.fantasy_players') is null
    or to_regclass('app.fantasy_gameweeks') is null
    or to_regclass('app.fantasy_seasons') is null
    or to_regclass('app.team_memberships') is null
    or to_regclass('app.fantasy_lineups') is null
    or to_regclass('app_private.fantasy_automation_settings') is null
    or to_regclass('app_private.notification_email_settings') is null
    or to_regprocedure('app_private.fantasy_scoring_input_document(uuid)') is null then
    raise exception 'stop: the database is missing the Fantasy tables or functions this update needs';
  end if;

  -- Not here yet.
  if to_regprocedure('app_private.fantasy_guard_finalizing_player_catalog()') is not null
    or to_regprocedure('app_private.fantasy_guard_finalizing_squad_membership()') is not null
    or to_regprocedure('app_private.fantasy_guard_finalizing_lineups()') is not null
    or exists (select 1 from pg_catalog.pg_trigger t where not t.tgisinternal and t.tgname in ('fantasy_players_guard_finalizing_inputs', 'team_memberships_guard_finalizing_inputs', 'fantasy_lineups_guard_finalizing_inputs')) then
    raise exception 'stop: the finalizing guard already exists -- was this applied by another route?';
  end if;

  -- The writers are paused (AGENTS.md): nothing else writes these tables while the triggers are created.
  if exists (select 1 from app_private.fantasy_automation_settings s where s.lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first: select app_private.fantasy_automation_configure(false); (see the header)';
  end if;
  if exists (select 1 from app_private.notification_email_settings s where s.football_live_refresh_enabled) then
    raise exception 'stop: the football live refresh is on -- pause it first: select app_private.notification_email_configure(''off'', null, null, false); (see the header)';
  end if;
  if to_regclass('app_private.account_deletion_settings') is not null
    and exists (select 1 from app_private.account_deletion_settings s where s.enabled) then
    raise exception 'stop: the account-deletion tick is on -- pause it first: select app_private.account_deletion_configure(false); (see the header)';
  end if;
  if to_regclass('app_private.fantasy_worker_lease') is not null
    and exists (select 1 from app_private.fantasy_worker_lease l
                where l.released_at is null and l.expires_at > statement_timestamp()) then
    raise exception 'stop: the Fantasy worker holds its lease -- wait until released_at is set or expires_at has passed (see the header)';
  end if;

  -- The functions this update relies on and does not change are the reviewed ones.
  for fn in
    select * from (values
      ('app_private.fantasy_guard_unfinished_price_catalog()', '047012b883b7be9860ee6fc26b7a7dbf', 'the price-processing guard of finalized gameweeks (20261009091728)'),
      ('app_private.fantasy_guard_unfinished_close_price_catalog()', '852c62632051522527c58c222b05ae50', 'the price-processing guard of closed gameweeks (20261013160200)'),
      ('app_private.fantasy_enforce_player_rules()', '1931c8a9cf427920258b32413e566a29', 'the Fantasy pool rule trigger (price and position) (20260720163222)'),
      ('app_private.fantasy_assert_scoring_snapshot(uuid,bigint,text)', '393862ee3ce5bb40e188d49d746c7106', 'the scoring snapshot check (fantasy_scoring_input_changed) (20260927094823)'),
      ('app_private.sofascore_create_catalog_player(uuid,uuid,text,integer,text)', 'bcf7a192ed8b8784d6f8dc922230dd29', 'the creation of a catalog player (player, membership, pool entry) (20261014170000)'),
      ('api.service_sofascore_auto_map_players(uuid,jsonb)', '1a241f1d5121b761c7ecd49734140f22', 'the SofaScore player matcher (20261014170000)')
    ) v(sig, md5_src, label)
  loop
    select p.prosrc into src from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    if src is null then
      raise exception 'stop: % does not exist (%)', fn.sig, fn.label;
    end if;
    if md5(src) <> fn.md5_src then
      raise exception 'stop: % is not the reviewed one (md5 %, expected %) -- %', fn.sig, md5(src), fn.md5_src, fn.label;
    end if;
  end loop;

  -- The scoring input document still lists the pool, the memberships and the lineups, and no other
  -- player table this guard does not cover (the chain: the base document, the adaptive, live and rating
  -- wrappers).
  select string_agg(p.prosrc, E'\n' order by p.proname) into document_src
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private' and p.proname like 'fantasy\_scoring\_input\_document%';
  select p.prosrc into src from pg_catalog.pg_proc p
  where p.oid = to_regprocedure('app_private.fantasy_scoring_input_document_v1(uuid)');
  if src is null
    or src !~ 'from app\.fantasy_players fp join app\.fantasy_positions pos'
    or src !~ 'app\.fantasy_lineups' then
    raise exception 'stop: the base scoring input document no longer lists the Fantasy pool and the lineups the way this guard covers';
  end if;
  if document_src is null
    or document_src !~ 'from app\.fantasy_players fp'
    or document_src !~ 'app\.team_memberships membership'
    or document_src !~ 'app\.fantasy_lineups'
    or document_src ~ 'app\.players\y'
    or document_src ~ 'app\.fantasy_squad_memberships' then
    raise exception 'stop: the scoring input document no longer reads what this guard covers (the Fantasy pool, the club memberships and the lineups, and no other player table)';
  end if;

  -- Baseline, to compare after: what must not move.
  perform set_config('bg.fgg_functions_before',
    (select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc), ',' order by p.oid::regprocedure::text), ''))
     from pg_catalog.pg_proc p
     where p.oid in (select to_regprocedure(v.sig) from (values
       ('app_private.fantasy_guard_unfinished_price_catalog()'),
       ('app_private.fantasy_guard_unfinished_close_price_catalog()'),
       ('app_private.fantasy_enforce_player_rules()'),
       ('app_private.fantasy_assert_scoring_snapshot(uuid,bigint,text)'),
       ('app_private.sofascore_create_catalog_player(uuid,uuid,text,integer,text)'),
       ('api.service_sofascore_auto_map_players(uuid,jsonb)')
     ) v(sig))), true);
  perform set_config('bg.fgg_triggers_before',
    (select md5(coalesce(string_agg(t.tgrelid::regclass::text || ':' || t.tgname || ':' || t.tgenabled::text, ',' order by t.tgrelid::regclass::text, t.tgname), ''))
     from pg_catalog.pg_trigger t
     where not t.tgisinternal
       and t.tgrelid in ('app.fantasy_players'::regclass, 'app.team_memberships'::regclass, 'app.fantasy_lineups'::regclass)), true);
  perform set_config('bg.fgg_rows_before',
    (select jsonb_build_array(
       (select count(*) from app.fantasy_players),
       (select count(*) from app.team_memberships),
       (select count(*) from app.fantasy_lineups))::text), true);
  perform set_config('bg.fgg_cron_jobs_before',
    (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
     from cron.job j), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261016110000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261016110000',
  'fantasy_finalizing_scoring_inputs_guard',
  array[$bg_20261016110000_file$-- A finalizing gameweek's scoring inputs cannot change underneath it (audit finding SEC-01, 2026-10-16).
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
$bg_20261016110000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261016110000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261016110000'
  );
begin
  if encode(sha256(convert_to(part_20261016110000, 'UTF8')), 'hex')
    is distinct from '0d42cb095505aec0e7d462a75082b6fd443cea58c04d0e20a96cd12f1694426a' then
    raise exception 'stop: 20261016110000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261016110000;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result (reads only)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  fn record;
  def record;
begin
  -- The three functions: the reviewed text, security definer, empty search path, callable by no API role.
  for fn in
    select * from (values
      ('app_private.fantasy_guard_finalizing_player_catalog()', 'f8df82f6509339f314e274bfefbead75'),
      ('app_private.fantasy_guard_finalizing_squad_membership()', 'b4139b27e62ed0bb4802e89f276dc07c'),
      ('app_private.fantasy_guard_finalizing_lineups()', '39d29bb5e61414dd70701dcd3fdc49ea')
    ) v(sig, md5_src)
  loop
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, l.lanname,
           has_function_privilege('public', p.oid, 'execute') as public_exec,
           has_function_privilege('anon', p.oid, 'execute') as anon_exec,
           has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
           has_function_privilege('service_role', p.oid, 'execute') as service_exec
      into def
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      problems := problems || (fn.sig || ' was not created');
    elsif md5(def.prosrc) <> fn.md5_src or not def.prosecdef or def.provolatile <> 'v'
      or def.lanname <> 'plpgsql' or def.proconfig is distinct from array['search_path=""']
      or def.public_exec or def.anon_exec or def.authenticated_exec or def.service_exec then
      problems := problems || (fn.sig || ' is not the reviewed text, or is not security definer with an empty search_path, or an API role can call it');
    end if;
  end loop;

  -- The three triggers: table, function, BEFORE ROW and events, enabled, watched columns.
  for fn in
    select * from (values
      ('fantasy_players_guard_finalizing_inputs', 'app.fantasy_players', 'app_private.fantasy_guard_finalizing_player_catalog()', 31, 'id,fantasy_season_id,football_player_id,football_team_id,position_id'),
      ('team_memberships_guard_finalizing_inputs', 'app.team_memberships', 'app_private.fantasy_guard_finalizing_squad_membership()', 31, 'player_id,team_id,season_id,valid_from,valid_to'),
      ('fantasy_lineups_guard_finalizing_inputs', 'app.fantasy_lineups', 'app_private.fantasy_guard_finalizing_lineups()', 11, '')
    ) v(trigger_name, table_name, function_sig, expected_type, expected_columns)
  loop
    select t.tgtype, t.tgenabled, t.tgfoid = to_regprocedure(fn.function_sig) as right_function,
           coalesce((select string_agg(a.attname::text, ',' order by u.ord)
                     from unnest(t.tgattr::int2[]) with ordinality as u(attnum, ord)
                     join pg_catalog.pg_attribute a on a.attrelid = t.tgrelid and a.attnum = u.attnum), '') as watched_columns,
           t.tgnargs, t.tgqual is null as no_when
      into def
    from pg_catalog.pg_trigger t
    where t.tgrelid = to_regclass(fn.table_name) and t.tgname = fn.trigger_name and not t.tgisinternal;
    if def.tgtype is null then
      problems := problems || (fn.trigger_name || ' was not created on ' || fn.table_name);
    elsif def.tgtype <> fn.expected_type or def.tgenabled <> 'O' or not def.right_function
      or def.watched_columns <> fn.expected_columns or def.tgnargs <> 0 or not def.no_when then
      problems := problems || (fn.trigger_name || ' is not a plain enabled BEFORE ROW trigger of the right function, events and columns');
    end if;
  end loop;

  -- Nothing else moved.
  if (select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc), ',' order by p.oid::regprocedure::text), ''))
      from pg_catalog.pg_proc p
      where p.oid in (select to_regprocedure(v.sig) from (values
       ('app_private.fantasy_guard_unfinished_price_catalog()'),
       ('app_private.fantasy_guard_unfinished_close_price_catalog()'),
       ('app_private.fantasy_enforce_player_rules()'),
       ('app_private.fantasy_assert_scoring_snapshot(uuid,bigint,text)'),
       ('app_private.sofascore_create_catalog_player(uuid,uuid,text,integer,text)'),
       ('api.service_sofascore_auto_map_players(uuid,jsonb)')
      ) v(sig)))
    is distinct from current_setting('bg.fgg_functions_before', true) then
    problems := problems || 'one of the six functions this update relies on changed'::text;
  end if;
  if (select md5(coalesce(string_agg(t.tgrelid::regclass::text || ':' || t.tgname || ':' || t.tgenabled::text, ',' order by t.tgrelid::regclass::text, t.tgname), ''))
      from pg_catalog.pg_trigger t
      where not t.tgisinternal
        and t.tgrelid in ('app.fantasy_players'::regclass, 'app.team_memberships'::regclass, 'app.fantasy_lineups'::regclass)
        and t.tgname not in ('fantasy_players_guard_finalizing_inputs', 'team_memberships_guard_finalizing_inputs', 'fantasy_lineups_guard_finalizing_inputs'))
    is distinct from current_setting('bg.fgg_triggers_before', true) then
    problems := problems || 'another trigger on the three tables changed'::text;
  end if;
  if (select jsonb_build_array(
        (select count(*) from app.fantasy_players),
        (select count(*) from app.team_memberships),
        (select count(*) from app.fantasy_lineups))::text)
    is distinct from current_setting('bg.fgg_rows_before', true) then
    problems := problems || 'a row count of the three tables changed'::text;
  end if;
  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j)
    is distinct from current_setting('bg.fgg_cron_jobs_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261016110000') then
    problems := problems || 'history row missing'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261016110000')
    then 'Applied. While a gameweek of a Fantasy season is finalizing, its player pool, the club memberships of its players and its lineups can no longer change (fantasy_scoring_inputs_frozen). Restore what you paused: select app_private.fantasy_automation_configure(true); and the e-mail and live refresh switch as the first query showed.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
