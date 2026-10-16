-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20261016180000_fantasy_deadline_mutation_lock
-- (audit finding SEC-01, second gap, 2026-10-16; docs/production/FANTASY_DEADLINE_LOCK_OWNER_RUNBOOK.md):
-- A manager's change that passed the deadline check can no longer commit after the gameweek is locked.
-- Why: every manager write checks the deadline against the moment the call started and read the
-- gameweek without a lock, so a call that started just before the deadline could commit after the lock
-- step had locked the lineups and moved the gameweek to 'locked'. Reproduced with two sessions on the
-- real functions: a squad created that way keeps an UNLOCKED lineup in a locked gameweek, which the lock
-- step never revisits and the scoring snapshot refuses on every pass (fantasy_lineup_not_locked), so the
-- gameweek cannot be scored; a chip activated that way is applied after the lock.
-- What: app_private.fantasy_assert_mutable_gameweek (used by the lineup save, the transfers and the
-- chips) and api.create_fantasy_team (as the pilot cap 20261016170000 left it) now take FOR KEY SHARE on
-- the gameweek row and check again; the lock step's FOR UPDATE on that row waits for them, and a call that
-- waited for the lock step is refused with the usual fantasy_gameweek_locked. A call after the deadline is
-- refused before any lock, as before. In a read-only transaction (the transfer preview) no lock is taken.
-- api.activate_fantasy_chip and api.cancel_fantasy_chip also refuse once the team's lineup of that
-- gameweek is locked (between two pages of the lock step the gameweek is still 'open').
-- Same refusals, same codes, same deadline. It replaces those four functions (same signatures, owners
-- and grants) and writes no data. It changes no table, trigger, setting, job, privilege, other function,
-- Fantasy rule or deadline.
-- Cost: a manager's write now waits while the gameweek row is held FOR UPDATE, including for the whole
-- fantasy-lifecycle-tick (its calendar sync holds the gameweek rows until the tick commits). Read the
-- tick's real duration first (docs/production/FANTASY_DEADLINE_LOCK_OWNER_RUNBOOK.md, "What it costs").
--
-- WHEN
--   Any time of day EXCEPT around a deadline: the script refuses while an open gameweek's deadline is
--   less than 30 minutes ahead (look first, read-only:
--     select id, sequence_number, deadline_at from app.fantasy_gameweeks where status = 'open';).
--   It needs 20260720141854, 20260924200000, 20260926003100, 20261016170000 recorded (the script checks). The statements need well
--   under a second.
--
-- WHAT TO PAUSE (AGENTS.md, "One writer at a time, per database")
--   It replaces four function definitions; it takes no table lock and writes no Fantasy row. The only
--   scheduled writer that runs the code around them is the Fantasy lifecycle (the lock step at the
--   deadline), so the script STOPS, before writing anything, unless it is paused:
--   * the Fantasy lifecycle tick and, with it, the Fantasy worker tick (fantasy-lifecycle-tick,
--     fantasy-worker-tick). First look at
--     select lifecycle_tick_enabled from app_private.fantasy_automation_settings;
--     then pause: select app_private.fantasy_automation_configure(false);
--     Pausing does not stop a pass already started: it keeps its lease for at most about eight minutes,
--     so wait until select holder, expires_at, released_at from app_private.fantasy_worker_lease;
--     shows released_at set or expires_at in the past (the script checks this too).
--   Not needed, and why: managers' own saves, transfers, chips and new squads are ordinary traffic and
--   keep working throughout (each call runs the old or the new definition whole; the swap is atomic at
--   commit). The live refresh, the e-mail, push, account-deletion, Manager Card, Trophées, Rivaux,
--   Pépites, news and prediction jobs do not call these four functions. Still make sure no other schema
--   change (another apply script, a migration, a deploy) is running right now.
--   Restore AFTER the commit, and only if it was on: select app_private.fantasy_automation_configure(true);
--
-- HOW TO RUN
--   0. Supabase dashboard -> project "BotolaGO Production V2" (the address contains
--      tkewgajrljbwgwedqsxn; the database holds no project name this script could check, so look
--      at the address) -> SQL Editor -> New query. Pause the Fantasy lifecycle tick first.
--   1. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one transaction, checked, and
--      then ROLLED BACK. The result row should say "Rehearsal passed".
--   2. Change the line `rollback;` near the bottom to `commit;` and press Run again. The result
--      row should say "Applied". Then restore the tick (above).
--   If any check fails, the script stops with a message saying what, and nothing is saved. Do not
--   edit a check to make it pass: a check firing means the database is not in the state this
--   script expects. Send the message.
--   To take it back: ship a forward migration that restores the four definitions it replaces
--   (docs/production/FANTASY_DEADLINE_LOCK_OWNER_RUNBOOK.md, "Rolling back"). Never edit this migration.
--
-- WHAT IT DOES
--   * refuses to run twice (history row, or the new definitions already there), before the migrations
--     above are recorded, while the Fantasy lifecycle tick is on or the Fantasy worker holds its lease,
--     less than 30 minutes before an open gameweek's deadline, where any function it replaces is not
--     byte for byte the repository's latest definition (md5 of its source; create_fantasy_team as the
--     pilot cap left it), and where any of the five functions it relies on is not: the lineup save, the
--     transfer preview and confirmation, the enrolment gameweek and the lock step;
--   * records the migration file in supabase_migrations.schema_migrations, whole as statements[1]
--     (the form the migration promoter and the other apply scripts use), and runs it from that
--     record once its sha256 matches the repository file;
--   * checks the result without writing anything: the four functions are the reviewed new text, security
--     definer with an empty search path, VOLATILE, with the owner and grants they had; the five functions
--     and every other function of the api and app_private schemas are as they were; the cron job list did
--     not move; the history row is there.
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
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261016180000') then
    raise exception 'stop: migration 20261016180000 is already recorded as applied';
  end if;
  for fn in select v.version from unnest(array['20260720141854', '20260924200000', '20260926003100', '20261016170000']) as v(version) loop
    if not exists (select 1 from supabase_migrations.schema_migrations where version = fn.version) then
      raise exception 'stop: migration % is not recorded -- apply it first (this update is written against it)', fn.version;
    end if;
  end loop;
  if to_regclass('app.fantasy_gameweeks') is null
    or to_regclass('app_private.fantasy_automation_settings') is null then
    raise exception 'stop: the database is missing the Fantasy tables this update needs';
  end if;

  -- The Fantasy lifecycle is paused (AGENTS.md) and no pass holds the worker lease.
  if exists (select 1 from app_private.fantasy_automation_settings s where s.lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first: select app_private.fantasy_automation_configure(false); (see the header)';
  end if;
  if to_regclass('app_private.fantasy_worker_lease') is not null
    and exists (select 1 from app_private.fantasy_worker_lease l
                where l.released_at is null and l.expires_at > statement_timestamp()) then
    raise exception 'stop: the Fantasy worker holds its lease -- wait until released_at is set or expires_at has passed (see the header)';
  end if;
  -- Not around a deadline.
  if exists (select 1 from app.fantasy_gameweeks g
             where g.status = 'open' and g.deadline_at > statement_timestamp()
               and g.deadline_at < statement_timestamp() + interval '30 minutes') then
    raise exception 'stop: an open gameweek''s deadline is less than 30 minutes away -- run this after it has been locked';
  end if;

  -- The four functions it replaces are the repository's latest definitions (not yet replaced).
  for fn in
    select * from (values
      ('app_private.fantasy_assert_mutable_gameweek(uuid)', '667a1543fba612c67743e82b3f69661a', 'the manager mutability check (deadline and open status) (20260720141854)'),
      ('api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'a85ae45fe4a131f754cd98571a8e39ab', 'the creation of a squad, with the pilot cap (20261016170000)'),
      ('api.activate_fantasy_chip(uuid,uuid,app.fantasy_chip_type,bigint,uuid)', 'e57c099282f4d6fa39787d0d99710b2c', 'the chip activation (20260926003100)'),
      ('api.cancel_fantasy_chip(uuid,uuid,bigint)', '2b25ca9f1f3a56f30eff31a787b80e7a', 'the chip cancellation (20260926003100)')
    ) v(sig, md5_src, label)
  loop
    select p.prosrc into src from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn.sig);
    if src is null then
      raise exception 'stop: % does not exist (%)', fn.sig, fn.label;
    end if;
    if md5(src) <> fn.md5_src then
      raise exception 'stop: % is not the reviewed one this update replaces (md5 %, expected %) -- % -- was it changed, or is the deadline lock already there?', fn.sig, md5(src), fn.md5_src, fn.label;
    end if;
  end loop;

  -- The functions this update relies on and does not change are the reviewed ones.
  for fn in
    select * from (values
      ('api.save_fantasy_lineup(uuid,uuid,jsonb,bigint,uuid)', 'bf26b06b876bc16f0cdc70532d706206', 'the lineup save (calls the check first) (20260926003100)'),
      ('api.preview_fantasy_transfers(uuid,uuid,jsonb,bigint,app.fantasy_chip_type)', '20bbf1160593f907737220f61d220726', 'the transfer preview (calls the check) (20260926003100)'),
      ('api.confirm_fantasy_transfers(uuid,uuid,jsonb,bigint,uuid,app.fantasy_chip_type)', '50ee8353838b2a4b44cd712834e5ac40', 'the transfer confirmation (calls the preview) (20260926003100)'),
      ('app_private.fantasy_enrolment_gameweek(uuid)', '1f9916b494585ebd1beee41b6abfd40d', 'the gameweek a new squad joins (20260924200000)'),
      ('api.service_advance_fantasy_lifecycle(uuid,bigint,integer)', '5fe4a52f82838e44fb27cf981bd9b25f', 'the lock step (gameweek row FOR UPDATE, then the lineups) (20260924200000)')
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

  -- Baseline, to compare after: what must not move.
  perform set_config('bg.fdl_other_functions_before',
    (select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || p.provolatile::text
                                    || ':' || coalesce(p.proacl::text, ''), ',' order by p.oid::regprocedure::text), ''))
     from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('api', 'app_private')
       and p.oid not in (select to_regprocedure(v.sig) from unnest(array['app_private.fantasy_assert_mutable_gameweek(uuid)', 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'api.activate_fantasy_chip(uuid,uuid,app.fantasy_chip_type,bigint,uuid)', 'api.cancel_fantasy_chip(uuid,uuid,bigint)']) v(sig))), true);
  perform set_config('bg.fdl_replaced_acl_before',
    (select string_agg(p.oid::regprocedure::text || ':' || pg_catalog.pg_get_userbyid(p.proowner) || ':'
                       || coalesce(p.proacl::text, ''), ',' order by p.oid::regprocedure::text)
     from pg_catalog.pg_proc p
     where p.oid in (select to_regprocedure(v.sig) from unnest(array['app_private.fantasy_assert_mutable_gameweek(uuid)', 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'api.activate_fantasy_chip(uuid,uuid,app.fantasy_chip_type,bigint,uuid)', 'api.cancel_fantasy_chip(uuid,uuid,bigint)']) v(sig))), true);
  perform set_config('bg.fdl_cron_jobs_before',
    (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
     from cron.job j), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20261016180000, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20261016180000',
  'fantasy_deadline_mutation_lock',
  array[$bg_20261016180000_file$-- A manager's change that passed the deadline check cannot commit after the gameweek is locked
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
--   2. api.create_fantasy_team: right after its two advisory locks (the user's, then the shared
--      player-list lock) and before the pilot-cap lock of 20261016170000, FOR KEY SHARE on the season row
--      and then on the gameweek it joins (the order its team insert's foreign keys take them in), then
--      app_private.fantasy_enrolment_gameweek again; a different answer is fantasy_gameweek_locked, as at
--      the top of the function. Otherwise byte for byte the definition of 20261016170000 (the pilot cap).
--   3. api.activate_fantasy_chip and api.cancel_fantasy_chip: right after the team row FOR UPDATE, refuse
--      (fantasy_gameweek_locked) when the team's lineup of that gameweek is already locked. Between two
--      lock-step pages (the worker's; the pg_cron tick runs up to 20 pages in one transaction) the gameweek
--      is still 'open', so the check above passes; this keeps a chip from changing after its lineup is
--      locked, as a lineup save and a transfer already were by their lineup check. Otherwise byte for byte
--      the definitions of 20260926003100.
-- No other function, table, trigger, grant or setting changes; the lock step, the scoring snapshot and every
-- Fantasy rule are as they were. CREATE OR REPLACE keeps the four functions' owners and grants.
--
-- LOCK ORDER. save_fantasy_lineup, activate_fantasy_chip and cancel_fantasy_chip take the new lock before
-- anything else (then the team row, then the lineup); create_fantasy_team takes, after its user and
-- player-list advisory locks, KEY SHARE on the season row, then on the gameweek row, then the pilot lock and
-- its inserts; confirm_fantasy_transfers takes it in preview, after the team row, where its transfer-batch
-- insert already took KEY SHARE on the same row. Every function that locks a gameweek row FOR UPDATE takes
-- it first (after the calendar advisory lock, or after the season row: api.service_activate_adaptive_scoring,
-- api.service_activate_adaptive_estimates and app_private.fantasy_rating_points_configure lock the season
-- FOR UPDATE, then every gameweek of it, which is why a new squad locks the season before the gameweek);
-- none waits for a team or lineup row a manager holds while holding the open gameweek row except the lock
-- step's lineup FOR UPDATE, which a manager only takes after the gameweek row. KEY SHARE does not conflict
-- with KEY SHARE, so the managers do not queue behind one another on these rows, nor behind the
-- lifecycle's plain status updates of them (FOR NO KEY UPDATE).
--
-- THE COST. A manager's write now waits while anything holds the open gameweek row FOR UPDATE: the lock
-- step, and the pg_cron fantasy-lifecycle-tick, whose calendar sync locks the gameweek rows FOR UPDATE and
-- keeps them until the whole tick commits. A save that used to pass during a tick now waits for the end of
-- the tick (see docs/production/FANTASY_DEADLINE_LOCK_OWNER_RUNBOOK.md, "What it costs").
--
-- Applying it writes no data. Forward-only; to take it back, a new migration restores the definitions of
-- 20260720141854 (assert, STABLE), 20261016170000 (create_fantasy_team) and 20260926003100 (the two chip
-- functions).
--
-- Prerequisites: 20260720141854 (the mutability check), 20260924200000 (the enrolment gameweek),
-- 20260926003100 (the chip functions as replaced here), 20261016170000 (create_fantasy_team as replaced
-- here, with the pilot cap).
do $$
begin
  if to_regprocedure('app_private.fantasy_assert_mutable_gameweek(uuid)') is null
    or to_regprocedure('app_private.fantasy_enrolment_gameweek(uuid)') is null
    or to_regprocedure('app_private.assert_mfa_step_up()') is null
    or to_regprocedure('api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)') is null
    or to_regprocedure('api.activate_fantasy_chip(uuid,uuid,app.fantasy_chip_type,bigint,uuid)') is null
    or to_regprocedure('api.cancel_fantasy_chip(uuid,uuid,bigint)') is null
    or to_regclass('app_private.pilot_settings') is null
    or to_regprocedure('app_private.pilot_manager_count(uuid)') is null then
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
-- 2. A new squad locks the gameweek it joins (as in 20261016170000, plus the lock)
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
  -- 20261016180000: lock the gameweek row the squad joins, then look again. The lock step
  -- (api.service_advance_fantasy_lifecycle) takes this row FOR UPDATE, which waits for this
  -- KEY SHARE, so the squad either commits before the lock step reads the lineups (and is
  -- locked with them) or waits for it; if the gameweek is then no longer the one a squad joins
  -- (it is 'locked'), the squad is refused here as at the top of the function. The season row
  -- first: the team insert's foreign keys lock the season, then the gameweek, and the owner's
  -- season-wide switches (adaptive scoring and estimates, rating points) lock the season FOR UPDATE
  -- before every gameweek; taking the gameweek first would wait on them in the opposite order.
  perform 1 from app.fantasy_seasons where id = season.id for key share;
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

-- ---------------------------------------------------------------------------
-- 3. A chip is activated only while the team's lineup is not locked (as in 20260926003100, plus the check)
-- ---------------------------------------------------------------------------
create or replace function api.activate_fantasy_chip(
  p_team_id uuid,
  p_gameweek_id uuid,
  p_chip_type app.fantasy_chip_type,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare gameweek app.fantasy_gameweeks%rowtype;
declare season app.fantasy_seasons%rowtype;
declare chip_rule app.fantasy_chip_rules%rowtype;
declare target app.fantasy_chip_uses%rowtype;
begin
  perform app_private.assert_mfa_step_up();
  team := app_private.fantasy_assert_owner(p_team_id);
  gameweek := app_private.fantasy_assert_mutable_gameweek(p_gameweek_id);
  if team.fantasy_season_id <> gameweek.fantasy_season_id or p_idempotency_key is null then
    raise exception using errcode = 'PT400', message = 'chip_unavailable';
  end if;
  select * into season from app.fantasy_seasons where id = team.fantasy_season_id;
  select * into chip_rule from app.fantasy_chip_rules rule
  where rule.ruleset_id = season.ruleset_id and rule.chip_type = p_chip_type
    and gameweek.sequence_number >= case
      when rule.allocation_code = 'wildcard_2'
        then coalesce(season.wildcard_split_gameweek + 1, rule.starts_at_gameweek)
      else rule.starts_at_gameweek end
    and (case
      when rule.allocation_code = 'wildcard_1'
        then coalesce(season.wildcard_split_gameweek, rule.ends_at_gameweek)
      else rule.ends_at_gameweek end is null
      or gameweek.sequence_number <= case
        when rule.allocation_code = 'wildcard_1'
          then coalesce(season.wildcard_split_gameweek, rule.ends_at_gameweek)
        else rule.ends_at_gameweek end)
  order by rule.starts_at_gameweek desc limit 1;
  if not found then raise exception using errcode = 'PT409', message = 'chip_unavailable'; end if;
  select * into team from app.fantasy_teams
  where id = p_team_id and user_id = current_user_id for update;
  -- 20261016180000: between two pages of the lock step the gameweek is still 'open'; once this team's
  -- lineup is locked, its chip is locked with it.
  if exists (select 1 from app.fantasy_lineups lineup
    where lineup.fantasy_team_id = team.id and lineup.gameweek_id = p_gameweek_id
      and lineup.locked_at is not null) then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
  if team.version <> p_expected_version then
    raise exception using errcode = 'PT409', message = 'version_conflict',
      detail = jsonb_build_object('latestVersion', team.version)::text;
  end if;
  select * into target from app.fantasy_chip_uses
  where fantasy_team_id = team.id and activation_idempotency_key = p_idempotency_key;
  if found then
    if target.chip_type <> p_chip_type or target.gameweek_id <> p_gameweek_id then
      raise exception using errcode = 'PT409', message = 'idempotency_conflict';
    end if;
    return jsonb_build_object('chipUseId', target.id, 'chipType', target.chip_type,
      'allocationCode', chip_rule.allocation_code, 'gameweekId', target.gameweek_id,
      'activatedAt', target.activated_at, 'teamVersion', team.version);
  end if;
  if exists (select 1 from app.fantasy_chip_uses use
    where use.fantasy_team_id = team.id and use.chip_rule_id = chip_rule.id) then
    raise exception using errcode = 'PT409', message = 'chip_already_used';
  end if;
  if exists (select 1 from app.fantasy_chip_uses use
    where use.fantasy_team_id = team.id and use.gameweek_id = p_gameweek_id) then
    raise exception using errcode = 'PT409', message = 'chip_conflict';
  end if;
  insert into app.fantasy_chip_uses (
    fantasy_team_id, gameweek_id, chip_type, chip_rule_id, activation_idempotency_key
  ) values (team.id, p_gameweek_id, p_chip_type, chip_rule.id, p_idempotency_key)
  returning * into target;
  update app.fantasy_teams set version = version + 1
  where id = team.id returning version into team.version;
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, base_version, resulting_version,
    idempotency_key, safe_metadata
  ) values (current_user_id, team.id, 'activate_chip', true, p_expected_version,
    team.version, p_idempotency_key, jsonb_build_object(
      'chipType', p_chip_type, 'allocationCode', chip_rule.allocation_code,
      'gameweekId', p_gameweek_id
    ));
  return jsonb_build_object('chipUseId', target.id, 'chipType', target.chip_type,
    'allocationCode', chip_rule.allocation_code, 'gameweekId', target.gameweek_id,
    'activatedAt', target.activated_at, 'teamVersion', team.version);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A chip is cancelled only while the team's lineup is not locked (as in 20260926003100, plus the check)
-- ---------------------------------------------------------------------------
create or replace function api.cancel_fantasy_chip(
  p_team_id uuid,
  p_gameweek_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
declare team app.fantasy_teams%rowtype;
declare target app.fantasy_chip_uses%rowtype;
declare rule app.fantasy_chip_rules%rowtype;
begin
  perform app_private.assert_mfa_step_up();
  team := app_private.fantasy_assert_owner(p_team_id);
  perform app_private.fantasy_assert_mutable_gameweek(p_gameweek_id);
  select * into team from app.fantasy_teams
  where id = p_team_id and user_id = current_user_id for update;
  -- 20261016180000: between two pages of the lock step the gameweek is still 'open'; once this team's
  -- lineup is locked, its chip is locked with it.
  if exists (select 1 from app.fantasy_lineups lineup
    where lineup.fantasy_team_id = team.id and lineup.gameweek_id = p_gameweek_id
      and lineup.locked_at is not null) then
    raise exception using errcode = 'PT409', message = 'fantasy_gameweek_locked';
  end if;
  if team.version <> p_expected_version then
    raise exception using errcode = 'PT409', message = 'version_conflict';
  end if;
  select * into target from app.fantasy_chip_uses use
  where use.fantasy_team_id = team.id and use.gameweek_id = p_gameweek_id
    and use.cancelled_at is null and use.finalized_at is null;
  if not found then raise exception using errcode = 'PT409', message = 'chip_unavailable'; end if;
  if target.chip_rule_id is not null then
    select * into rule from app.fantasy_chip_rules where id = target.chip_rule_id;
    if not rule.activation_cancellable then
      raise exception using errcode = 'PT409', message = 'chip_unavailable';
    end if;
  end if;
  if exists (select 1 from app.fantasy_transfer_batches batch
    where batch.fantasy_team_id = team.id and batch.gameweek_id = p_gameweek_id
      and batch.chip_type in ('wildcard','free_hit')) then
    raise exception using errcode = 'PT409', message = 'chip_unavailable';
  end if;
  update app.fantasy_chip_uses set cancelled_at = statement_timestamp() where id = target.id;
  update app.fantasy_teams set version = version + 1
  where id = team.id returning version into team.version;
  insert into app_private.fantasy_mutation_audit (
    user_id, fantasy_team_id, operation, accepted, base_version, resulting_version, safe_metadata
  ) values (current_user_id, team.id, 'cancel_chip', true, p_expected_version,
    team.version, jsonb_build_object('gameweekId', p_gameweek_id));
  return jsonb_build_object('cancelled', true, 'teamVersion', team.version);
end;
$$;
$bg_20261016180000_file$]
);

-- ---------------------------------------------------------------------------
-- Run it from the history, once it is the repository file byte for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20261016180000 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20261016180000'
  );
begin
  if encode(sha256(convert_to(part_20261016180000, 'UTF8')), 'hex')
    is distinct from 'ce9efc38bf103a82f37c6f2fd76edf776bb3a8ddb2b97a6d470fb9b22af8b1a8' then
    raise exception 'stop: 20261016180000 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20261016180000;
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
  -- The four functions: the reviewed new text, security definer, empty search path, VOLATILE.
  for fn in
    select * from (values
      ('app_private.fantasy_assert_mutable_gameweek(uuid)', 'f8f0e0188ed0c69b6e07c92b50d1fa75'),
      ('api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', '0942c5db54db9eb632f5de5c08f476ed'),
      ('api.activate_fantasy_chip(uuid,uuid,app.fantasy_chip_type,bigint,uuid)', '36d2dded6fddf5b3cd49758144b26df6'),
      ('api.cancel_fantasy_chip(uuid,uuid,bigint)', 'cc491a21215e570bdf03924b649f907b')
    ) v(sig, md5_src)
  loop
    select p.prosrc, p.prosecdef, p.provolatile, p.proconfig, l.lanname
      into def
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure(fn.sig);
    if def.prosrc is null then
      problems := problems || (fn.sig || ' is missing');
    elsif md5(def.prosrc) <> fn.md5_src or not def.prosecdef or def.provolatile <> 'v'
      or def.lanname <> 'plpgsql' or def.proconfig is distinct from array['search_path=""'] then
      problems := problems || (fn.sig || ' is not the reviewed text, or is not a VOLATILE security definer function with an empty search_path');
    end if;
  end loop;

  -- Same owner and grants as before (create or replace keeps them).
  if (select string_agg(p.oid::regprocedure::text || ':' || pg_catalog.pg_get_userbyid(p.proowner) || ':'
                        || coalesce(p.proacl::text, ''), ',' order by p.oid::regprocedure::text)
      from pg_catalog.pg_proc p
      where p.oid in (select to_regprocedure(v.sig) from unnest(array['app_private.fantasy_assert_mutable_gameweek(uuid)', 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'api.activate_fantasy_chip(uuid,uuid,app.fantasy_chip_type,bigint,uuid)', 'api.cancel_fantasy_chip(uuid,uuid,bigint)']) v(sig)))
    is distinct from current_setting('bg.fdl_replaced_acl_before', true) then
    problems := problems || 'the owner or the grants of a replaced function changed'::text;
  end if;
  if has_function_privilege('anon', 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'execute')
    or has_function_privilege('authenticated', 'app_private.fantasy_assert_mutable_gameweek(uuid)', 'execute')
    or has_function_privilege('service_role', 'app_private.fantasy_assert_mutable_gameweek(uuid)', 'execute') then
    problems := problems || 'an API role can call what it must not'::text;
  end if;

  -- Nothing else moved.
  if (select md5(coalesce(string_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || p.provolatile::text
                                     || ':' || coalesce(p.proacl::text, ''), ',' order by p.oid::regprocedure::text), ''))
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('api', 'app_private')
        and p.oid not in (select to_regprocedure(v.sig) from unnest(array['app_private.fantasy_assert_mutable_gameweek(uuid)', 'api.create_fantasy_team(uuid,uuid,text,jsonb,uuid)', 'api.activate_fantasy_chip(uuid,uuid,app.fantasy_chip_type,bigint,uuid)', 'api.cancel_fantasy_chip(uuid,uuid,bigint)']) v(sig)))
    is distinct from current_setting('bg.fdl_other_functions_before', true) then
    problems := problems || 'another function of the api or app_private schema changed'::text;
  end if;
  if (select md5(coalesce(string_agg(j.jobname || ':' || j.schedule || ':' || j.active::text, ',' order by j.jobname), ''))
      from cron.job j)
    is distinct from current_setting('bg.fdl_cron_jobs_before', true) then
    problems := problems || 'the cron job list moved'::text;
  end if;

  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261016180000') then
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
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20261016180000')
    then 'Applied. A lineup save, a transfer, a chip or a new squad that passed the deadline check now holds the gameweek row until it commits, so it cannot land after the lock. Restore the tick if it was on: select app_private.fantasy_automation_configure(true);'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
