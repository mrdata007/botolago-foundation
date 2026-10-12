-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Manager Card: install RULES V2 ("calm scores"), owner decision 2026-10-12.
--
-- WHAT IT DOES, in one transaction
--   1. Records and applies migration 20261012170000
--      (manager_card_shrinkage_and_selection) with the exact reviewed text. It
--      replaces ONE function, app_private.manager_card_evaluate_gameweek, so that
--      a rules row can ask for (a) stats pulled toward 50 by their number of
--      samples and (b) Selection counted on the eleven the manager picked rather
--      than after automatic substitutions. A rules row without those keys (v1)
--      behaves exactly as before.
--   2. Inserts rules version 2 and makes it the one active row (version 1 goes
--      inactive; it is never edited: a rules row is immutable).
--         provisional_below  2 -> 5       (the card is provisional until 5 weeks)
--         scales.sel         [[0.5,1],[1,99]] -> [[0.5,1],[0.8,50],[1,99]]
--                            (0.8 of the best eleven is average, 1.0 is perfect)
--         shrinkage          cap 4, sel 4, con 4, trf 4
--                            shrunk = round(50 + (scaled - 50) * n / (n + k)),
--                            n = the samples of that stat (TRF: transfers)
--         sel_numerator      "picked_starters"
--      Everything else is the same as version 1 (the script refuses otherwise).
--   Compute stays OFF and the tick stays paused: this script switches nothing
--   back on. A new active version has no evaluations, so once the tick runs
--   again it recomputes EVERY finished gameweek from the start, a few per tick
--   (docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md, "Load"); cards move to the
--   v2 figures as it catches up. Do it outside match days.
--
-- BEFORE (AGENTS.md "One writer at a time": this is a database write)
--   a. The pull request is merged and its database-quality job passed.
--   b. Read and note the switches, then pause the card's only writer:
--        select compute_enabled, read_enabled from app_private.manager_card_settings;
--        select app_private.manager_card_configure(false, null);
--        select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-tick'), active := false);
--      Wait until no manager-card-tick run is in progress (the script checks it).
--   c. Nothing else should be writing the card (the founder grant, another
--      rules script). The script takes the card's advisory lock for its length,
--      so a calculation cannot start meanwhile.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Paste this WHOLE file and press Run. As shipped it ends in
--      ROLLBACK: the migration, the row and every check run, then nothing stays.
--      Read the last result row (it says what was verified). Confirm
--      independently that nothing was kept:
--        select count(*) from supabase_migrations.schema_migrations where version = '20261012170000';   -- 0
--        select version, active from app_private.manager_card_rules;                                   -- v1 active only
--   2. Change ONLY the final `rollback;` to `commit;` and run it once.
--   3. Read it back independently (same two queries: 1 and "2 rows, v2 active").
--   4. Restore the writers right away, exactly as they were:
--        select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-tick'), active := true);
--        select app_private.manager_card_configure(true, null);   -- only if compute was on before
--      The next tick starts the recalculation under v2.
--   If any check fails the script stops with a message and nothing is saved. Do
--   not edit a check to make it pass: a check firing means the database is not
--   in the state this script expects.
--
-- WHAT IT CHECKS
--   Before: the migration is absent and its predecessors present; the function
--   it replaces is byte for byte the reviewed one (md5 of its body, the body of
--   20261008123200); exactly one rules row exists, version 1 and active; the
--   pasted v2 config differs from it only where intended; compute is off, the
--   tick job is paused and idle, no card statement is running, and the card's
--   lock is free. After applying: the migration text is the reviewed bytes
--   (sha256, checked before it runs); the new body is the reviewed one (md5);
--   owner, security definer, empty search_path and grants are unchanged (postgres
--   only). After inserting: exactly two rows, v2 the only active one, v1 left as
--   it was; every key present with the right type and no unknown key; the card's
--   own scale and tier functions accept the config; the new Selection scale
--   reads 1 / 50 / 99 at 0.5 / 0.8 / 1; compute is still off, the tick answers
--   {"outcome":"off"} and nothing was written to the card.
-- ============================================================================
begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  -- ==========================================================================
  -- The v2 config: version 1 with the four intended changes. A JSON object.
  -- ==========================================================================
  config_text text := $rules_v2_config${"minimum_gameweeks":2,"provisional_below":5,"trf_window_gameweeks":3,"batch_size":2000,"scales":{"cap":[[0,1],[1,99]],"sel":[[0.5,1],[0.8,50],[1,99]],"trf":[[-10,1],[0,50],[10,99]],"con":[[0,1],[1,99]]},"tiers":{"stade":50,"pro":65,"champion":80,"legend":90},"cap_ignore_deadlines_before":"2026-10-10T12:38:05Z","shrinkage":{"cap":4,"sel":4,"con":4,"trf":4},"sel_numerator":"picked_starters"}$rules_v2_config$;
  -- ==========================================================================
  cfg jsonb;
  v1 jsonb;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261012170000') then
    raise exception 'stop: migration 20261012170000 is already recorded -- was this script already applied?';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
      where version in ('20261008123000', '20261008123100', '20261008123200', '20261008123300', '20261008123400',
        '20261010120000', '20261010120100', '20261010120200', '20261010120300')) <> 9 then
    raise exception 'stop: the Manager Card migrations (20261008123000 .. 20261010120300) are not all recorded';
  end if;
  -- The function this replaces is exactly the reviewed one (body of 20261008123200).
  if to_regprocedure('app_private.manager_card_evaluate_gameweek(uuid,integer)') is null
    or md5((select prosrc from pg_proc where oid = 'app_private.manager_card_evaluate_gameweek(uuid,integer)'::regprocedure))
      is distinct from 'b6ceef5f62ce5b8ccd66b1e926a8c5b2' then
    raise exception 'stop: manager_card_evaluate_gameweek is not the reviewed version this script replaces';
  end if;

  -- The writers are paused and drained.
  if not exists (select 1 from app_private.manager_card_settings) then
    raise exception 'stop: the Manager Card settings row is missing';
  end if;
  if exists (select 1 from app_private.manager_card_settings where compute_enabled) then
    raise exception 'stop: compute is switched on -- pause it first: select app_private.manager_card_configure(false, null);';
  end if;
  if not exists (select 1 from cron.job where jobname = 'manager-card-tick') then
    raise exception 'stop: the manager-card-tick job does not exist';
  end if;
  if exists (select 1 from cron.job where jobname = 'manager-card-tick' and active) then
    raise exception 'stop: the manager-card-tick job is active -- pause it: select cron.alter_job((select jobid from cron.job where jobname = ''manager-card-tick''), active := false);';
  end if;
  if exists (
    select 1 from cron.job_run_details run join cron.job job on job.jobid = run.jobid
    where job.jobname = 'manager-card-tick' and run.status not in ('succeeded', 'failed')
  ) then
    raise exception 'stop: a manager-card-tick run is still in progress -- wait for it to finish';
  end if;
  if exists (
    select 1 from pg_stat_activity
    where pid <> pg_backend_pid() and state = 'active' and query ~* 'manager_card'
  ) then
    raise exception 'stop: a statement mentioning the Manager Card is running -- wait for it to finish';
  end if;
  -- The card's own lock (the one the tick, the calculation and the founder grant
  -- take): held until this transaction ends, so no calculation starts meanwhile.
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:manager-card', 0)) then
    raise exception 'stop: a Manager Card calculation holds the card lock';
  end if;

  -- The rules: version 1 alone, active; the pasted v2 differs from it only where intended.
  if (select count(*) from app_private.manager_card_rules) <> 1
    or not exists (select 1 from app_private.manager_card_rules where version = 1 and active) then
    raise exception 'stop: expected exactly one rules row, version 1, active';
  end if;
  select config into v1 from app_private.manager_card_rules where version = 1;
  if v1 ?| array['shrinkage', 'sel_numerator'] then
    raise exception 'stop: rules v1 already carries a v2 key';
  end if;

  if left(btrim(config_text), 1) <> '{' then
    raise exception 'stop: the rules config is not a JSON object';
  end if;
  begin
    cfg := config_text::jsonb;
  exception when others then
    raise exception 'stop: the rules config is not valid JSON (%)', sqlerrm;
  end;
  if jsonb_typeof(cfg) is distinct from 'object' then
    raise exception 'stop: the rules config must be one JSON object';
  end if;
  -- Only the four intended differences: provisional_below, scales.sel, shrinkage, sel_numerator.
  if ((cfg - 'provisional_below' - 'shrinkage' - 'sel_numerator') #- '{scales,sel}')
    is distinct from ((v1 - 'provisional_below') #- '{scales,sel}') then
    raise exception 'stop: the v2 config differs from the stored rules v1 in more than the intended keys -- find out why before going on';
  end if;

  -- Hand the config, and a fingerprint of the card, to the steps below (this transaction only).
  perform set_config('manager_card.rules_v2_config', cfg::text, true);
  perform set_config('manager_card.rules_v1_before', v1::text, true);
  perform set_config('manager_card.card_before', concat_ws('#',
    (select count(*) from app.manager_cards), (select count(*) from app.manager_card_seasons),
    (select count(*) from app.manager_card_gameweeks), (select count(*) from app_private.manager_card_evaluations),
    (select count(*) from app_private.manager_card_job_log)), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The migration: recorded with the exact reviewed text, then executed
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261012170000', 'manager_card_shrinkage_and_selection', array[$migration$-- Manager Card: calmer early scores and a fairer Selection (rules v2).
-- Owner-approved 2026-10-12. Calculation only: no Fantasy point, rule, price or
-- lineup is touched, and the card stays display only.
--
-- WHY. After two finished weeks the card swung by tens of points: a stat built
-- on two samples read as certainty. And Selection (SEL) credited a manager with
-- the points the automatic substitutions earned for him, which he did not pick,
-- on a scale (0.5 -> 1, 1 -> 99) that made a good week look ordinary.
--
-- WHAT. Replaces app_private.manager_card_evaluate_gameweek(uuid, integer), and
-- nothing else, so that a rules row can ask for two optional behaviours:
--
--   1. SHRINKAGE. After a stat is mapped onto 1..99 with its scale, it is
--      pulled toward 50 by the number of samples n it is built on:
--          shrunk = round(50 + (scaled - 50) * n / (n + k)), kept in 1..99
--      k is config.shrinkage.<stat> (cap, sel, con, trf). n is, per team:
--        CAP  the weeks with a CAP ratio (not skipped),
--        SEL  the weeks with a SEL ratio (not Bench Boost, best eleven > 0),
--        CON  the weeks counted for CON (every finished week),
--        TRF  the transfers counted (not the batches).
--      Worked example, k = 4: two perfect weeks, scaled 99, n = 2:
--      50 + 49 * 2 / 6 = 66.33 -> 66. At n = 8 it is 50 + 49 * 8 / 12 = 82.67
--      -> 83: the pull fades as the season fills. OVR keeps its rule (the
--      rounded mean of the stats that exist, only when at least three of the
--      four do) but over the shrunk stats; the tier comes from that OVR. The
--      stored raw figures (cap_raw ...) stay the plain averages.
--
--   2. SELECTION NUMERATOR. config.sel_numerator = 'picked_starters' makes the
--      numerator of the SEL ratio the points of the eleven players the manager
--      picked as starters: the final_points of the players of the result's
--      locked lineup with app.fantasy_lineup_players.slot = 'starter' (the same
--      rows and points the best-eleven denominator is built from), a starter
--      who did not play contributing his own 0 (or negative) points, without
--      the captain's bonus and without what the automatic substitutions added
--      from the bench. The denominator is unchanged: the best legal eleven of
--      the lineup's fifteen. Bench Boost weeks and a best eleven of 0 or less
--      are still skipped, and the ratio is still kept in 0..1. The other value,
--      'starting_points' (the default when the key is absent), is the previous
--      behaviour: app.fantasy_team_gameweek_results.starting_points, which
--      includes the automatic substitutions.
--
-- COMPATIBILITY. A rules row without these keys behaves exactly as before: no
-- shrinkage (k = 0 gives shrunk = scaled) and the substituted starting_points
-- numerator. Rules v1, the active row, therefore keeps producing the figures
-- it produces today until a v2 row is activated
-- (scripts/backend/apply-manager-card-rules-v2-calm.sql). Rules rows are
-- immutable, so v1 is never edited; v2 is a new version, and having no ledger
-- rows it makes the next tick recompute every finished gameweek from the
-- start. A present but malformed shrinkage or sel_numerator is
-- manager_card_rules_invalid. Signature, security definer, search_path, owner
-- and grants are those of 20261008123200 (create or replace keeps owner and
-- grants). The sample counts are internal: no table, column or api function
-- changes.
--
-- The body is that of 20261008123200 with these changes only: the variables
-- sel_numerator and shrink_cap/sel/con/trf read from the config after the
-- scales; the mc_sel statement (numerator); the counts n carried through the
-- figures statement; and the shrink step between the scaling and the OVR.

create or replace function app_private.manager_card_evaluate_gameweek(p_gameweek_id uuid, p_rules_version integer)
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
  sel_numerator text;
  shrink_cap numeric;
  shrink_sel numeric;
  shrink_con numeric;
  shrink_trf numeric;
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
  -- Optional behaviours (absent = the plain calculation of rules v1): the
  -- numerator of SEL, and how hard each stat is pulled toward 50 (k = 0: not).
  sel_numerator := 'starting_points';
  if cfg ? 'sel_numerator' then
    if jsonb_typeof(cfg -> 'sel_numerator') is distinct from 'string'
      or (cfg ->> 'sel_numerator') not in ('starting_points', 'picked_starters') then
      raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
    end if;
    sel_numerator := cfg ->> 'sel_numerator';
  end if;
  shrink_cap := 0; shrink_sel := 0; shrink_con := 0; shrink_trf := 0;
  if cfg ? 'shrinkage' then
    if jsonb_typeof(cfg -> 'shrinkage') is distinct from 'object' then
      raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
    end if;
    shrink_cap := app_private.manager_card_config_number(cfg -> 'shrinkage', 'cap');
    shrink_sel := app_private.manager_card_config_number(cfg -> 'shrinkage', 'sel');
    shrink_con := app_private.manager_card_config_number(cfg -> 'shrinkage', 'con');
    shrink_trf := app_private.manager_card_config_number(cfg -> 'shrinkage', 'trf');
    if least(shrink_cap, shrink_sel, shrink_con, shrink_trf) < 0 then
      raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
    end if;
  end if;

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
    least(1, greatest(0, (
      -- $13 = 'picked_starters': the points of the eleven picked as starters
      -- (lineup players with slot 'starter', their own final_points, 0 when
      -- they did not play), not the automatic substitutions' result. Otherwise
      -- the result's starting_points, as before.
      case when $13 = 'picked_starters' then picked.pts else r.starting_points::numeric end
    ) / b.best)) as ratio
  from pg_temp.mc_res r
  join pg_temp.mc_best b on b.lineup_id = r.lineup_id
  left join lateral (
    select coalesce(sum(lp.pts), 0) as pts
    from pg_temp.mc_lp lp
    where lp.lineup_id = r.lineup_id and lp.slot = 'starter'
  ) picked on true
  where r.chip_type is distinct from 'bench_boost' and b.best > 0
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version, sel_numerator;

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
    select team_id, round(avg(ratio), 6) as v, count(*)::integer as n from pg_temp.mc_cap where ratio is not null group by team_id
  ), sel_avg as (
    select team_id, round(avg(ratio), 6) as v, count(*)::integer as n from pg_temp.mc_sel group by team_id
  ), trf_avg as (
    select team_id, round(avg(value), 6) as v, count(*)::integer as n from pg_temp.mc_trf group by team_id
  ), con_avg as (
    select team_id, round(avg(case when top_half then 1 else 0 end), 6) as v, count(*)::integer as n from pg_temp.mc_con group by team_id
  ), raw as (
    select t.team_id, t.user_id, coalesce(c.counted, 0) as counted,
      cap_avg.v as cap_raw, sel_avg.v as sel_raw, trf_avg.v as trf_raw, con_avg.v as con_raw,
      cap_avg.n as cap_n, sel_avg.n as sel_n, trf_avg.n as trf_n, con_avg.n as con_n
    from pg_temp.mc_teams t
    left join counted c on c.team_id = t.team_id
    left join cap_avg on cap_avg.team_id = t.team_id
    left join sel_avg on sel_avg.team_id = t.team_id
    left join trf_avg on trf_avg.team_id = t.team_id
    left join con_avg on con_avg.team_id = t.team_id
  ), gated as (
    select raw.team_id, raw.user_id, raw.counted, raw.cap_n, raw.sel_n, raw.trf_n, raw.con_n,
      case when raw.counted >= $8 then raw.cap_raw end as cap_raw,
      case when raw.counted >= $8 then raw.sel_raw end as sel_raw,
      case when raw.counted >= $8 then raw.trf_raw end as trf_raw,
      case when raw.counted >= $8 then raw.con_raw end as con_raw
    from raw
  ), scaled as (
    select g.*,
      app_private.manager_card_scale(g.cap_raw, $10 -> 'cap') as cap_s,
      app_private.manager_card_scale(g.sel_raw, $10 -> 'sel') as sel_s,
      app_private.manager_card_scale(g.trf_raw, $10 -> 'trf') as trf_s,
      app_private.manager_card_scale(g.con_raw, $10 -> 'con') as con_s
    from gated g
  ), shrunk as (
    -- Toward 50 by the stat's own sample count n and its k ($14..$17):
    -- 50 + (scaled - 50) * n / (n + k). k = 0 (no shrinkage key) keeps the
    -- scaled figure as it is.
    select s.team_id, s.user_id, s.counted, s.cap_raw, s.sel_raw, s.trf_raw, s.con_raw,
      case when $14 > 0 and s.cap_s is not null
        then least(99, greatest(1, round(50 + (s.cap_s - 50)::numeric * s.cap_n / (s.cap_n + $14))))::smallint
        else s.cap_s end as cap,
      case when $15 > 0 and s.sel_s is not null
        then least(99, greatest(1, round(50 + (s.sel_s - 50)::numeric * s.sel_n / (s.sel_n + $15))))::smallint
        else s.sel_s end as sel,
      case when $16 > 0 and s.trf_s is not null
        then least(99, greatest(1, round(50 + (s.trf_s - 50)::numeric * s.trf_n / (s.trf_n + $16))))::smallint
        else s.trf_s end as trf,
      case when $17 > 0 and s.con_s is not null
        then least(99, greatest(1, round(50 + (s.con_s - 50)::numeric * s.con_n / (s.con_n + $17))))::smallint
        else s.con_s end as con
    from scaled s
  ), rated as (
    select s.*,
      case when (s.cap is not null)::integer + (s.sel is not null)::integer
        + (s.trf is not null)::integer + (s.con is not null)::integer >= 3
      then round((coalesce(s.cap, 0) + coalesce(s.sel, 0) + coalesce(s.trf, 0) + coalesce(s.con, 0))::numeric
        / ((s.cap is not null)::integer + (s.sel is not null)::integer
          + (s.trf is not null)::integer + (s.con is not null)::integer))::smallint
      end as ovr
    from shrunk s
  )
  select r.team_id, r.user_id, r.counted, r.cap_raw, r.sel_raw, r.trf_raw, r.con_raw,
    r.cap, r.sel, r.trf, r.con, r.ovr,
    app_private.manager_card_tier(r.ovr, $11) as tier,
    (r.counted < $9) as provisional
  from rated r
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version, sel_numerator, shrink_cap, shrink_sel, shrink_trf, shrink_con;
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

comment on function app_private.manager_card_evaluate_gameweek(uuid, integer) is
  'Recomputes the Manager Card figures of the active teams with a final result in the gameweek, from every evaluable gameweek of the season up to it. Rules may ask (config.shrinkage, config.sel_numerator) for stats pulled toward 50 by their sample count and for Selection to count the picked starters; without those keys the figures are the plain ones. Writes only card tables and the ledger; writes nothing when the scoring version moved during the run. Idempotent.';
$migration$]);

do $apply$
declare source text;
begin
  select statements[1] into source from supabase_migrations.schema_migrations where version = '20261012170000';
  if encode(sha256(convert_to(source, 'UTF8')), 'hex')
    is distinct from '0c7638d81aca7d07a42db410b0f7b337c404db6329cf35d678bc60c3afa1bc01'
  then raise exception 'stop: migration differs from reviewed repository bytes'; end if;
  execute source;
end $apply$;

do $verify$
begin
  if md5((select prosrc from pg_proc where oid = 'app_private.manager_card_evaluate_gameweek(uuid,integer)'::regprocedure))
    is distinct from '02c36e056d098d66d4575502e97a54dc'
  then raise exception 'stop: the function body differs from the reviewed migration'; end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'app_private.manager_card_evaluate_gameweek(uuid,integer)'::regprocedure
      and p.prosecdef and p.proowner = 'postgres'::regrole
      and p.proconfig @> array['search_path=""']
  ) then raise exception 'stop: owner, security definer or search_path differ from the reviewed function'; end if;
  if has_function_privilege('anon', 'app_private.manager_card_evaluate_gameweek(uuid,integer)', 'execute')
    or has_function_privilege('authenticated', 'app_private.manager_card_evaluate_gameweek(uuid,integer)', 'execute')
    or has_function_privilege('service_role', 'app_private.manager_card_evaluate_gameweek(uuid,integer)', 'execute')
    or not has_function_privilege('postgres', 'app_private.manager_card_evaluate_gameweek(uuid,integer)', 'execute')
  then raise exception 'stop: permissions differ from the reviewed migration (postgres alone may execute it)'; end if;
end $verify$;

-- ---------------------------------------------------------------------------
-- Rules v2: the one insert, version 1 goes inactive (never edited)
-- ---------------------------------------------------------------------------
update app_private.manager_card_rules set active = false where version = 1 and active;
insert into app_private.manager_card_rules (version, config, active)
values (2, current_setting('manager_card.rules_v2_config')::jsonb, true);

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  cfg jsonb;
  problems text[] := '{}';
  expected_top text[] := array[
    'minimum_gameweeks', 'provisional_below', 'trf_window_gameweeks', 'batch_size',
    'scales', 'tiers', 'cap_ignore_deadlines_before', 'shrinkage', 'sel_numerator'
  ];
  one_key text;
  stat text;
  tier_name text;
  bad_pairs integer;
  bad_order integer;
  probe smallint;
  ticked jsonb;
  lo numeric;
  previous_value numeric;
begin
  -- Exactly two rows: v1 inactive and untouched, v2 the one active row, equal to what was pasted.
  if (select count(*) from app_private.manager_card_rules) <> 2
    or (select count(*) from app_private.manager_card_rules where active) <> 1
    or not exists (select 1 from app_private.manager_card_rules where version = 2 and active)
    or not exists (select 1 from app_private.manager_card_rules where version = 1 and not active) then
    raise exception 'stop: expected exactly two rules rows, version 2 the only active one';
  end if;
  if (select config from app_private.manager_card_rules where version = 1)
    is distinct from current_setting('manager_card.rules_v1_before')::jsonb then
    raise exception 'stop: rules v1 changed';
  end if;
  select config into cfg from app_private.manager_card_rules where version = 2;
  if cfg is distinct from current_setting('manager_card.rules_v2_config')::jsonb then
    raise exception 'stop: the stored config differs from the pasted one';
  end if;

  -- Unknown top-level keys (a typo would otherwise be ignored silently).
  for one_key in select k from jsonb_object_keys(cfg) k loop
    if one_key <> all (expected_top) then
      problems := array_append(problems, ('unknown key ' || one_key)::text);
    end if;
  end loop;

  -- The four numbers.
  foreach one_key in array array['minimum_gameweeks', 'provisional_below', 'trf_window_gameweeks', 'batch_size'] loop
    if jsonb_typeof(cfg -> one_key) is distinct from 'number' then
      problems := array_append(problems, (one_key || ' is missing or not a number')::text);
    elsif (cfg ->> one_key)::numeric <> trunc((cfg ->> one_key)::numeric)
      or (cfg ->> one_key)::numeric < 1 then
      problems := array_append(problems, (one_key || ' must be a whole number of at least 1')::text);
    end if;
  end loop;
  if jsonb_typeof(cfg -> 'minimum_gameweeks') = 'number' and jsonb_typeof(cfg -> 'provisional_below') = 'number'
    and (cfg ->> 'provisional_below')::numeric < (cfg ->> 'minimum_gameweeks')::numeric then
    problems := array_append(problems, 'provisional_below must not be below minimum_gameweeks'::text);
  end if;
  if (cfg ->> 'provisional_below') is distinct from '5' then
    problems := array_append(problems, 'provisional_below must be 5 in rules v2'::text);
  end if;

  -- Optional CAP start date.
  if (cfg -> 'cap_ignore_deadlines_before') is not null then
    if jsonb_typeof(cfg -> 'cap_ignore_deadlines_before') is distinct from 'string' then
      problems := array_append(problems, 'cap_ignore_deadlines_before must be a string (ISO 8601 with Z) or left out'::text);
    else
      begin
        perform (cfg ->> 'cap_ignore_deadlines_before')::timestamptz;
      exception when others then
        problems := array_append(problems, 'cap_ignore_deadlines_before is not a date and time'::text);
      end;
    end if;
  end if;

  -- The new keys.
  if jsonb_typeof(cfg -> 'shrinkage') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(cfg -> 'shrinkage')) <> 4 then
    problems := array_append(problems, 'shrinkage must be an object with exactly cap, sel, con and trf'::text);
  else
    foreach stat in array array['cap', 'sel', 'con', 'trf'] loop
      if jsonb_typeof(cfg -> 'shrinkage' -> stat) is distinct from 'number'
        or (cfg -> 'shrinkage' ->> stat)::numeric < 0 or (cfg -> 'shrinkage' ->> stat)::numeric > 100 then
        problems := array_append(problems, ('shrinkage.' || stat || ' must be a number between 0 and 100')::text);
      end if;
    end loop;
  end if;
  if cfg -> 'sel_numerator' is distinct from to_jsonb('picked_starters'::text) then
    problems := array_append(problems, 'sel_numerator must be "picked_starters" in rules v2'::text);
  end if;

  -- The four scales.
  if jsonb_typeof(cfg -> 'scales') is distinct from 'object' then
    problems := array_append(problems, 'scales is missing or not an object'::text);
  else
    foreach stat in array array['cap', 'sel', 'trf', 'con'] loop
      if jsonb_typeof(cfg -> 'scales' -> stat) is distinct from 'array'
        or jsonb_array_length(cfg -> 'scales' -> stat) < 2 then
        problems := array_append(problems, ('scales.' || stat || ' must be a list of at least two [raw, score] pairs')::text);
        continue;
      end if;
      select count(*) filter (where jsonb_typeof(point) is distinct from 'array'
          or jsonb_array_length(point) <> 2
          or jsonb_typeof(point -> 0) is distinct from 'number'
          or jsonb_typeof(point -> 1) is distinct from 'number')
      into bad_pairs
      from jsonb_array_elements(cfg -> 'scales' -> stat) point;
      if bad_pairs > 0 then
        problems := array_append(problems, ('scales.' || stat || ' has an entry that is not a [number, number] pair')::text);
        continue;
      end if;
      -- raw strictly rising, score between 1 and 99
      select count(*) filter (where previous_x is not null and x <= previous_x),
        count(*) filter (where y < 1 or y > 99)
      into bad_order, bad_pairs
      from (
        select (point ->> 0)::numeric as x, (point ->> 1)::numeric as y,
          lag((point ->> 0)::numeric) over (order by ordinality) as previous_x
        from jsonb_array_elements(cfg -> 'scales' -> stat) with ordinality as t(point, ordinality)
      ) pts;
      if bad_order > 0 then
        problems := array_append(problems, ('scales.' || stat || ': the raw values must strictly rise')::text);
      end if;
      if bad_pairs > 0 then
        problems := array_append(problems, ('scales.' || stat || ': every score must be between 1 and 99')::text);
      end if;
      -- The card's own function must accept it (low end).
      select (point ->> 0)::numeric into lo from jsonb_array_elements(cfg -> 'scales' -> stat) point limit 1;
      probe := app_private.manager_card_scale(lo, cfg -> 'scales' -> stat);
      if probe is null or probe < 1 or probe > 99 then
        problems := array_append(problems, ('scales.' || stat || ' did not parse in manager_card_scale')::text);
      end if;
    end loop;
    -- The new Selection scale: 0.5 of the best eleven is the floor, 0.8 is average, 1.0 is perfect.
    if app_private.manager_card_scale(0.5, cfg -> 'scales' -> 'sel') is distinct from 1::smallint
      or app_private.manager_card_scale(0.8, cfg -> 'scales' -> 'sel') is distinct from 50::smallint
      or app_private.manager_card_scale(1, cfg -> 'scales' -> 'sel') is distinct from 99::smallint then
      problems := array_append(problems, 'the SEL scale must read 1, 50 and 99 at 0.5, 0.8 and 1'::text);
    end if;
  end if;

  -- The tiers.
  if jsonb_typeof(cfg -> 'tiers') is distinct from 'object' then
    problems := array_append(problems, 'tiers is missing or not an object'::text);
  else
    previous_value := 0;
    foreach tier_name in array array['stade', 'pro', 'champion', 'legend'] loop
      if jsonb_typeof(cfg -> 'tiers' -> tier_name) is distinct from 'number' then
        problems := array_append(problems, ('tiers.' || tier_name || ' is missing or not a number')::text);
        previous_value := null;
      elsif (cfg -> 'tiers' ->> tier_name)::numeric < 1 or (cfg -> 'tiers' ->> tier_name)::numeric > 99 then
        problems := array_append(problems, ('tiers.' || tier_name || ' must be between 1 and 99')::text);
        previous_value := null;
      elsif previous_value is not null and (cfg -> 'tiers' ->> tier_name)::numeric <= previous_value then
        problems := array_append(problems, 'tiers must rise: stade < pro < champion < legend'::text);
        previous_value := (cfg -> 'tiers' ->> tier_name)::numeric;
      else
        previous_value := (cfg -> 'tiers' ->> tier_name)::numeric;
      end if;
    end loop;
    if (select count(*) from jsonb_object_keys(cfg -> 'tiers')) <> 4 then
      problems := array_append(problems, 'tiers must have exactly stade, pro, champion and legend'::text);
    end if;
    if cardinality(problems) = 0 and app_private.manager_card_tier(50, cfg -> 'tiers') is null then
      problems := array_append(problems, 'tiers did not parse in manager_card_tier'::text);
    end if;
  end if;

  -- Compute is still off, the tick still does nothing, and nothing was written to the card.
  if exists (select 1 from app_private.manager_card_settings where compute_enabled) then
    problems := array_append(problems, 'compute is switched on'::text);
  end if;
  ticked := app_private.manager_card_tick();
  if ticked is distinct from '{"outcome": "off"}'::jsonb then
    problems := array_append(problems, ('the tick answered ' || coalesce(ticked::text, 'nothing') || ' instead of off')::text);
  end if;
  if concat_ws('#',
    (select count(*) from app.manager_cards), (select count(*) from app.manager_card_seasons),
    (select count(*) from app.manager_card_gameweeks), (select count(*) from app_private.manager_card_evaluations),
    (select count(*) from app_private.manager_card_job_log)) is distinct from current_setting('manager_card.card_before') then
    problems := array_append(problems, 'something was written to the card'::text);
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: rules v2 did not check out: %', problems;
  end if;
  raise notice 'manager card rules v2: migration applied, function and grants as reviewed, one active row, every key valid, compute still off';
end
$postflight$;

-- What was verified (read this row; the transaction is rolled back below unless you changed it).
select 'All checks passed: migration 20261012170000 applied with the reviewed bytes, function body and grants as reviewed, rules v2 inserted and active (v1 inactive, unchanged), compute still off. If the last line of this script says rollback; nothing was saved; if it says commit; this is now installed -- restore the writers (see the header), the tick then recalculates every finished gameweek under v2.' as result,
  (select string_agg(version::text || case when active then ' (active)' else '' end, ', ' order by version) from app_private.manager_card_rules) as rules_rows,
  (select count(*) from supabase_migrations.schema_migrations where version = '20261012170000') as migration_rows_in_this_transaction;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To install for real, change ONLY the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;
