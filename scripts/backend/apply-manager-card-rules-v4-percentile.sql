-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Manager Card: install RULES V4 ("each week ranked among managers"), owner
-- decision 2026-10-14 (option A of docs/backend/MANAGER_CARD_RATING_POINTS_PROPOSAL.md).
--
-- WHAT IT DOES, in one transaction
--   1. Records and applies migration 20261014160000
--      (manager_card_gameweek_percentile) with the exact reviewed text. It
--      replaces app_private.manager_card_evaluate_gameweek only: one optional
--      rules key, normalize, which with "gameweek_percentile" turns each
--      weekly CAP, SEL and TRF figure into the manager's mid-rank percentile
--      among that week's managers and gives CON a tie rule. A rules row
--      without the key (v1, v2, v3) gives exactly the figures it gave before.
--   2. Inserts rules version 4 and makes it the one active row (version 3 goes
--      inactive; rows are never edited). v4 is v3 with:
--         normalize   (new) "gameweek_percentile"
--         scales.cap  [[0,1],[1,99]]              -> [[0,1],[0.5,50],[1,99]]
--         scales.sel  [[0.5,1],[0.8,50],[1,99]]   -> [[0,1],[0.5,50],[1,99]]
--         scales.trf  [[-10,1],[0,50],[10,99]]    -> [[0,1],[0.5,50],[1,99]]
--      Everything else is v3 (the script refuses otherwise): scales.con, the
--      tiers 50/65/80/90, the shrinkage k = 4, minimum 1 week, provisional
--      below 5, Selection on the picked eleven, OVR from every stat, a stat
--      with no sample reads 50.
--   Compute stays OFF, the tick stays paused and the notification switch is
--   left as it is: this script switches nothing on. Once the tick runs again it
--   recomputes EVERY finished gameweek under v4, a few per tick; that
--   recalculation records no rating change and sends no notification (a switch
--   of rules version is not a change of rating).
--
-- BEFORE (AGENTS.md "One writer at a time": this is a database write)
--   a. The pull request is merged and its database-quality job passed.
--   b. Read and note the switches, then pause the card's writers:
--        select compute_enabled, read_enabled, notify_ovr_changes from app_private.manager_card_settings;
--        select app_private.manager_card_configure(false, null);
--        select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-tick'), active := false);
--      or run scripts/backend/sofascore-rating-release-pause.sql, which pauses
--      every background writer, the card's included (see the runbook, "Rules
--      v4", for the order with that script). Wait until no manager-card-tick
--      run is in progress (the script checks it).
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Paste this WHOLE file and press Run. As shipped it ends in
--      ROLLBACK. Read the last result row. Confirm independently that nothing
--      was kept:
--        select count(*) from supabase_migrations.schema_migrations where version = '20261014160000';   -- 0
--        select version, active from app_private.manager_card_rules order by version;                  -- v3 active
--   2. Change ONLY the final `rollback;` to `commit;` and run it once.
--   3. Read it back: one 20261014160000 row, four rules rows, v4 the only active one.
--   4. Restore the writers, exactly as they were (or run
--      scripts/backend/sofascore-rating-release-resume.sql if the pause script
--      was used):
--        select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-tick'), active := true);
--        select app_private.manager_card_configure(true, null);
--   If any check fails the script stops with a message and nothing is saved. Do
--   not edit a check to make it pass.
--
-- WHAT IT CHECKS
--   Before: 20261014160000 is absent and the card's migrations up to
--   20261012200100 (rules v3) are recorded; the function it replaces is byte
--   for byte the reviewed 20261012200100 body (md5); exactly three rules rows,
--   v1 and v2 inactive and v3 active, and the pasted v4 differs from v3 only in
--   normalize and the CAP, SEL and TRF scales; compute is off, the tick job is
--   paused and idle, no card statement is running, and the card's lock is free.
--   After applying: the migration text is the reviewed bytes (sha256, checked
--   before it runs); the new body is the reviewed one (md5); owner postgres,
--   security definer, empty search_path; no API role can execute it. After
--   inserting: four rows, v4 the only active one, v1 to v3 unchanged; every key
--   present with the right value and no unknown key; the switches are as they
--   were, the tick answers {"outcome":"off"} and nothing was written to the
--   card or the notifications.
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
  -- The v4 config: version 3 with the intended changes. A JSON object.
  -- ==========================================================================
  config_text text := $rules_v4_config${"minimum_gameweeks":1,"provisional_below":5,"trf_window_gameweeks":3,"batch_size":2000,"normalize":"gameweek_percentile","scales":{"cap":[[0,1],[0.5,50],[1,99]],"sel":[[0,1],[0.5,50],[1,99]],"trf":[[0,1],[0.5,50],[1,99]],"con":[[0,1],[1,99]]},"tiers":{"stade":50,"pro":65,"champion":80,"legend":90},"shrinkage":{"cap":4,"sel":4,"con":4,"trf":4},"sel_numerator":"picked_starters","ovr_min_stats":1,"empty_stat_neutral":true}$rules_v4_config$;
  -- ==========================================================================
  cfg jsonb;
  v1 jsonb;
  v2 jsonb;
  v3 jsonb;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261014160000') then
    raise exception 'stop: migration 20261014160000 is already recorded -- was this script already applied?';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
      where version in ('20261008123000', '20261008123100', '20261008123200', '20261008123300', '20261008123400',
        '20261010120000', '20261010120100', '20261010120200', '20261010120300', '20261012170000',
        '20261012200000', '20261012200100')) <> 12 then
    raise exception 'stop: the Manager Card migrations up to 20261012200100 (rules v3) are not all recorded -- run apply-manager-card-rules-v3-week-one.sql first';
  end if;

  -- The function this replaces is exactly the reviewed one (rules v3's body).
  if md5((select prosrc from pg_proc where oid = 'app_private.manager_card_evaluate_gameweek(uuid,integer)'::regprocedure))
      is distinct from '8a0ea1ae87c3a80e3c5294dee0b961f2' then
    raise exception 'stop: manager_card_evaluate_gameweek is not the reviewed version (20261012200100) this script replaces';
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
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:manager-card', 0)) then
    raise exception 'stop: a Manager Card calculation holds the card lock';
  end if;

  -- The rules: v1 and v2 inactive, v3 active; the pasted v4 differs from v3 only where intended.
  if (select count(*) from app_private.manager_card_rules) <> 3
    or not exists (select 1 from app_private.manager_card_rules where version = 1 and not active)
    or not exists (select 1 from app_private.manager_card_rules where version = 2 and not active)
    or not exists (select 1 from app_private.manager_card_rules where version = 3 and active) then
    raise exception 'stop: expected exactly three rules rows, versions 1 and 2 inactive and version 3 active';
  end if;
  select config into v1 from app_private.manager_card_rules where version = 1;
  select config into v2 from app_private.manager_card_rules where version = 2;
  select config into v3 from app_private.manager_card_rules where version = 3;
  if v3 ? 'normalize' then
    raise exception 'stop: rules v3 already carries the normalize key';
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
  -- Only the intended differences: normalize, and the CAP, SEL and TRF scales.
  if (cfg - 'normalize' - 'scales') is distinct from (v3 - 'scales')
    or ((cfg -> 'scales') - 'cap' - 'sel' - 'trf') is distinct from ((v3 -> 'scales') - 'cap' - 'sel' - 'trf') then
    raise exception 'stop: the v4 config differs from the stored rules v3 in more than the intended keys -- find out why before going on';
  end if;

  perform set_config('manager_card.rules_v4_config', cfg::text, true);
  perform set_config('manager_card.rules_v1_before', v1::text, true);
  perform set_config('manager_card.rules_v2_before', v2::text, true);
  perform set_config('manager_card.rules_v3_before', v3::text, true);
  perform set_config('manager_card.settings_before', (
    select concat_ws('#', s.compute_enabled, s.read_enabled, s.notify_ovr_changes)
    from app_private.manager_card_settings s), true);
  perform set_config('manager_card.card_before', concat_ws('#',
    (select count(*) from app.manager_cards), (select count(*) from app.manager_card_seasons),
    (select count(*) from app.manager_card_gameweeks), (select count(*) from app_private.manager_card_evaluations),
    (select count(*) from app_private.manager_card_job_log), (select count(*) from app.manager_card_ovr_changes),
    (select count(*) from app_private.notification_events), (select count(*) from app.notifications)), true);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The migration: recorded with the exact reviewed text, then executed
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261014160000', 'manager_card_gameweek_percentile', array[$migration$-- Manager Card: rank each week among managers (rules key "normalize").
-- Owner decision 2026-10-14 (option A of
-- docs/backend/MANAGER_CARD_RATING_POINTS_PROPOSAL.md): from Fantasy gameweek 5
-- a player's points are his SofaScore rating, so raw point ratios no longer
-- mean what the rules v3 scales were drawn for. Under the new key, CAP, SEL and
-- TRF say "how you ranked against the other managers that week" (50 = the
-- middle manager), whatever the size of the points. Calculation and display
-- only: no Fantasy point, rule, price or lineup is touched, and the card stays
-- display only.
--
-- WHAT
--
--   app_private.manager_card_evaluate_gameweek(uuid, integer) is replaced. Its
--   body is that of 20261012200100 with these changes only:
--
--     a. one optional rules key, normalize: "none" (the default when absent)
--        or "gameweek_percentile". Anything else is manager_card_rules_invalid.
--        ABSENT (or "none") GIVES EXACTLY TODAY'S FIGURES: rules v1, v2 and v3
--        are unchanged (manager_card_gameweek_percentile.test.sql checks it).
--
--     b. with "gameweek_percentile", after the weekly figures are built and
--        before they are averaged, each one becomes the manager's mid-rank
--        percentile in its cohort:
--          (teams strictly below + (teams level - 1) / 2) / (cohort size - 1),
--        0.5 when the cohort is one. Mid-rank, not percent_rank(): ties are
--        frequent with rating points (many captains are the best starter) and
--        percent_rank() would put a whole tie at its bottom.
--          CAP  among the teams of the same gameweek whose CAP week counts
--               (a skipped week stays skipped and is not in the cohort);
--          SEL  among the teams of the same gameweek with a SEL week (Bench
--               Boost weeks stay absent);
--          TRF  per transfer, among the judged transfers made for the same
--               gameweek (same window, so the same mix of point scales; they
--               are judged together);
--          CON  the top-half figure gets a tie rule: 1 when the team's whole
--               tie group is in the top half, 0 when it is wholly in the bottom
--               half, 0.5 when it straddles the middle (the middle team of an
--               odd field included). With above = teams strictly ahead and
--               upto = teams ahead or level (itself included): 1 if
--               upto * 2 <= n, 0 if above * 2 >= n, else 0.5. Without the key
--               CON is exactly as before (above * 2 < n).
--        The cohort is the teams this run rates (active teams of the season
--        with a final result in the gameweek being evaluated), the base every
--        stat already used. cap_raw, sel_raw and trf_raw then hold the average
--        percentile (0 to 1), and con_raw the average CON figure.
--
--     c. mc_trf carries the batch's gameweek sequence (b_seq) for (b). Nothing
--        else reads it.
--
--   Averages, shrinkage, empty_stat_neutral, OVR, tiers, provisional, the
--   rating-change record, the notification and every write are unchanged.
--
-- WHY THE PERCENTILE IS SCALE-FREE. A weekly percentile depends only on the
-- order of the managers' figures that week. Multiplying every point (players,
-- team totals and hits) by a positive constant changes no order, so it changes
-- no card. Adding a constant to every player's points changes no TRF gain and
-- no CON order; it can reorder CAP or SEL ratios of teams whose best starters
-- differ, but the week's cohort still averages 0.5 (the middle manager is 50)
-- so cards cannot drift up or down as a group, which is what rules v3 does
-- with rating points.
--
-- COMPATIBILITY. Same signature, security definer, empty search_path, owner and
-- grants (create or replace keeps owner and grants). No API change. Installed,
-- with rules v4, by scripts/backend/apply-manager-card-rules-v4-percentile.sql.

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
  ovr_min integer;
  neutral_empty boolean;
  normalize text;
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
  -- Week one (absent = rules v1 and v2): how many of the four stats OVR needs
  -- (default 3), and whether a stat with no sample yet reads the neutral 50
  -- (what the shrinkage gives at n = 0) instead of staying empty.
  ovr_min := 3;
  if cfg ? 'ovr_min_stats' then
    if jsonb_typeof(cfg -> 'ovr_min_stats') is distinct from 'number'
      or (cfg ->> 'ovr_min_stats') !~ '^[1-4]$' then
      raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
    end if;
    ovr_min := (cfg ->> 'ovr_min_stats')::integer;
  end if;
  neutral_empty := false;
  if cfg ? 'empty_stat_neutral' then
    if jsonb_typeof(cfg -> 'empty_stat_neutral') is distinct from 'boolean' then
      raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
    end if;
    neutral_empty := (cfg ->> 'empty_stat_neutral')::boolean;
  end if;
  -- Ranking each week (absent = rules v1 to v3): "gameweek_percentile" turns
  -- each weekly CAP, SEL and TRF figure into the manager's mid-rank percentile
  -- among that week's managers, and gives CON its tie rule.
  normalize := 'none';
  if cfg ? 'normalize' then
    if jsonb_typeof(cfg -> 'normalize') is distinct from 'string'
      or (cfg ->> 'normalize') not in ('none', 'gameweek_percentile') then
      raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
    end if;
    normalize := cfg ->> 'normalize';
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
  select ranked.team_id, ranked.gameweek_id, (ranked.above * 2 < ranked.n) as top_half,
    -- $13 = 'gameweek_percentile': the tie rule (1 whole tie group in the top
    -- half, 0 wholly in the bottom half, 0.5 across the middle). Otherwise the
    -- plain top half, as before.
    case when $13 = 'gameweek_percentile' then
      case when ranked.upto * 2 <= ranked.n then 1.0
           when ranked.above * 2 >= ranked.n then 0.0
           else 0.5 end
    end as half
  from (
    select r.fantasy_team_id as team_id, r.gameweek_id,
      rank() over (partition by r.gameweek_id order by r.final_score desc) - 1 as above,
      rank() over (partition by r.gameweek_id order by r.final_score desc) - 1
        + count(*) over (partition by r.gameweek_id, r.final_score) as upto,
      count(*) over (partition by r.gameweek_id) as n
    from app.fantasy_team_gameweek_results r
    join app.fantasy_teams t
      on t.id = r.fantasy_team_id and t.fantasy_season_id = $1 and t.status = 'active'
    join pg_temp.mc_gws g on g.gameweek_id = r.gameweek_id
    where r.state = 'final'
  ) ranked
  where ranked.team_id in (select team_id from pg_temp.mc_teams)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version, normalize;

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
  select bt.team_id, tr.id as transfer_id, bt.b_seq,
    coalesce(sum(case when p.fantasy_player_id = tr.player_in_id then p.pts else -p.pts end), 0)
      - bt.point_hit::numeric / bt.transfers_count as value
  from batches bt
  join ready on ready.batch_id = bt.batch_id
  join app.fantasy_transfers tr on tr.transfer_batch_id = bt.batch_id
  left join used u on u.batch_id = bt.batch_id
  left join pg_temp.mc_pts p
    on p.gameweek_id = u.gameweek_id and p.fantasy_player_id in (tr.player_in_id, tr.player_out_id)
  group by bt.team_id, tr.id, bt.b_seq, bt.point_hit, bt.transfers_count
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- Ranking each week (normalize = gameweek_percentile): each weekly figure
  -- becomes its mid-rank percentile in its cohort, (below + (level - 1) / 2) /
  -- (n - 1), 0.5 alone. CAP and SEL by gameweek (a skipped CAP week stays
  -- null and outside the cohort), TRF per transfer by the batch's gameweek.
  if normalize = 'gameweek_percentile' then
    execute pg_catalog.concat($q$
    update pg_temp.mc_cap c set ratio = p.pct
    from (
      select x.team_id, x.gameweek_id,
        case when count(*) over (partition by x.gameweek_id) <= 1 then 0.5
        else ((rank() over (partition by x.gameweek_id order by x.ratio) - 1)
              + (count(*) over (partition by x.gameweek_id, x.ratio) - 1) / 2.0)
             / (count(*) over (partition by x.gameweek_id) - 1)
        end as pct
      from pg_temp.mc_cap x
      where x.ratio is not null
    ) p
    where c.team_id = p.team_id and c.gameweek_id = p.gameweek_id
    $q$, '');
    execute pg_catalog.concat($q$
    update pg_temp.mc_sel c set ratio = p.pct
    from (
      select x.team_id, x.gameweek_id,
        case when count(*) over (partition by x.gameweek_id) <= 1 then 0.5
        else ((rank() over (partition by x.gameweek_id order by x.ratio) - 1)
              + (count(*) over (partition by x.gameweek_id, x.ratio) - 1) / 2.0)
             / (count(*) over (partition by x.gameweek_id) - 1)
        end as pct
      from pg_temp.mc_sel x
      where x.ratio is not null
    ) p
    where c.team_id = p.team_id and c.gameweek_id = p.gameweek_id
    $q$, '');
    execute pg_catalog.concat($q$
    update pg_temp.mc_trf c set value = p.pct
    from (
      select x.transfer_id,
        case when count(*) over (partition by x.b_seq) <= 1 then 0.5
        else ((rank() over (partition by x.b_seq order by x.value) - 1)
              + (count(*) over (partition by x.b_seq, x.value) - 1) / 2.0)
             / (count(*) over (partition by x.b_seq) - 1)
        end as pct
      from pg_temp.mc_trf x
    ) p
    where c.transfer_id = p.transfer_id
    $q$, '');
  end if;

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
    select team_id, round(avg(coalesce(half, case when top_half then 1 else 0 end)), 6) as v, count(*)::integer as n from pg_temp.mc_con group by team_id
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
    -- scaled figure as it is. A stat with no sample is null, or the neutral 50
    -- when the rules ask for it ($18, empty_stat_neutral) and the team is past
    -- the minimum.
    select s.team_id, s.user_id, s.counted, s.cap_raw, s.sel_raw, s.trf_raw, s.con_raw,
      coalesce(case when $14 > 0 and s.cap_s is not null
        then least(99, greatest(1, round(50 + (s.cap_s - 50)::numeric * s.cap_n / (s.cap_n + $14))))::smallint
        else s.cap_s end, case when $18 and s.counted >= $8 then 50::smallint end) as cap,
      coalesce(case when $15 > 0 and s.sel_s is not null
        then least(99, greatest(1, round(50 + (s.sel_s - 50)::numeric * s.sel_n / (s.sel_n + $15))))::smallint
        else s.sel_s end, case when $18 and s.counted >= $8 then 50::smallint end) as sel,
      coalesce(case when $16 > 0 and s.trf_s is not null
        then least(99, greatest(1, round(50 + (s.trf_s - 50)::numeric * s.trf_n / (s.trf_n + $16))))::smallint
        else s.trf_s end, case when $18 and s.counted >= $8 then 50::smallint end) as trf,
      coalesce(case when $17 > 0 and s.con_s is not null
        then least(99, greatest(1, round(50 + (s.con_s - 50)::numeric * s.con_n / (s.con_n + $17))))::smallint
        else s.con_s end, case when $18 and s.counted >= $8 then 50::smallint end) as con
    from scaled s
  ), rated as (
    select s.*,
      case when (s.cap is not null)::integer + (s.sel is not null)::integer
        + (s.trf is not null)::integer + (s.con is not null)::integer >= $19
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
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version, sel_numerator, shrink_cap, shrink_sel, shrink_trf, shrink_con, neutral_empty, ovr_min;
  execute pg_catalog.concat($q$
  select count(*)  from pg_temp.mc_fig
  $q$, '') into team_count using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

  -- The scoring may have moved while this ran: write nothing.
  fingerprint_after := app_private.manager_card_season_fingerprint(season.id);
  if fingerprint_after is distinct from fingerprint_before then
    perform app_private.manager_card_drop_temp();
    return jsonb_build_object('outcome', 'version_changed', 'gameweekId', gw.id);
  end if;
  -- The rating change of each team at this gameweek, read before its history
  -- row is written: the latest earlier history row of the season (the
  -- previous evaluated OVR). A change counts only when both OVRs exist, they
  -- differ, the earlier row is under these rules, and this gameweek's own row
  -- is new or already under these rules: a recalculation under a NEW rules
  -- version (rows still under the old one) records no change, so switching
  -- versions never reads as the card moving.
  execute pg_catalog.concat($q$
  create temp table mc_chg on commit drop as
  select f.user_id, f.ovr as to_ovr, f.tier as to_tier, prev.ovr as from_ovr, prev.tier as from_tier,
    coalesce(f.ovr is not null and prev.ovr is not null and f.ovr <> prev.ovr
      and prev.rules_version = $12
      and (cur.user_id is null or cur.rules_version = $12), false) as changed
  from pg_temp.mc_fig f
  left join app.manager_card_gameweeks cur on cur.user_id = f.user_id and cur.gameweek_id = $2
  left join lateral (
    select h.ovr, h.tier, h.rules_version
    from app.manager_card_gameweeks h
    join app.fantasy_gameweeks g on g.id = h.gameweek_id
    where h.user_id = f.user_id and h.fantasy_season_id = $1 and g.sequence_number < $3
    order by g.sequence_number desc
    limit 1
  ) prev on true
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

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

  -- The rating changes (display and notification only): one row per manager
  -- and gameweek, kept in step with the history row. A recalculation that no
  -- longer finds a change removes the row; one that finds a different change
  -- updates it.
  execute pg_catalog.concat($q$
  delete from app.manager_card_ovr_changes c
  using pg_temp.mc_chg x
  where c.user_id = x.user_id and c.gameweek_id = $2 and not x.changed
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  execute pg_catalog.concat($q$
  insert into app.manager_card_ovr_changes as c (
    user_id, fantasy_season_id, gameweek_id, rules_version, from_ovr, to_ovr, from_tier, to_tier
  )
  select x.user_id, $1, $2, $12, x.from_ovr, x.to_ovr, x.from_tier, x.to_tier
  from pg_temp.mc_chg x
  where x.changed
  on conflict (user_id, gameweek_id) do update set
    fantasy_season_id = excluded.fantasy_season_id, rules_version = excluded.rules_version,
    from_ovr = excluded.from_ovr, to_ovr = excluded.to_ovr,
    from_tier = excluded.from_tier, to_tier = excluded.to_tier, updated_at = statement_timestamp()
  where (c.fantasy_season_id, c.rules_version, c.from_ovr, c.to_ovr, c.from_tier, c.to_tier)
    is distinct from
    (excluded.fantasy_season_id, excluded.rules_version, excluded.from_ovr, excluded.to_ovr,
      excluded.from_tier, excluded.to_tier)
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
  -- Not in manager_card_drop_temp's list: dropped here, so that the next
  -- gameweek evaluated in the same transaction can create it again.
  execute pg_catalog.concat($q$
  drop table pg_temp.mc_chg
  $q$, '');

  -- The notification of those changes, while its switch is on. A failure there
  -- never costs the card its figures: it is undone alone and retried by no
  -- one (the next gameweek brings the next change).
  begin
    perform app_private.manager_card_notify_ovr_changes(gw.id);
  exception when others then
    null;
  end;

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
  'Recomputes the Manager Card figures of the active teams with a final result in the gameweek, from every evaluable gameweek of the season up to it. Rules may ask (config.shrinkage, config.sel_numerator, config.ovr_min_stats, config.empty_stat_neutral, config.normalize) for stats pulled toward 50 by their sample count, Selection counted on the picked starters, OVR from fewer stats, a neutral 50 for a stat with no sample, and each weekly CAP, SEL and TRF figure ranked among that week''s managers (mid-rank percentile, with a tie rule for CON); without those keys the figures are the plain ones. Records the rating change against the previous evaluated OVR under the same rules, and notifies it while that switch is on. Writes only card tables, the ledger and (switch on) the notification tables; writes nothing when the scoring version moved during the run. Idempotent.';

$migration$]);

do $apply$
declare source text;
begin
  select statements[1] into source from supabase_migrations.schema_migrations where version = '20261014160000';
  if encode(sha256(convert_to(source, 'UTF8')), 'hex')
    is distinct from '44ae5d150902ee75ad87a7a3ddb11e9cf53d366c5e3e2f5080c5dc860ebe26f6'
  then raise exception 'stop: migration differs from reviewed repository bytes'; end if;
  execute source;
end $apply$;

do $verify$
declare
  problems text[] := '{}';
begin
  if md5((select prosrc from pg_proc where oid = 'app_private.manager_card_evaluate_gameweek(uuid,integer)'::regprocedure))
    is distinct from '7bf551331ff9151e043b2ad8e8e35f95' then problems := problems || 'manager_card_evaluate_gameweek body'::text; end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'app_private.manager_card_evaluate_gameweek(uuid,integer)'::regprocedure
      and p.prosecdef and p.proowner = 'postgres'::regrole and p.proconfig @> array['search_path=""']
  ) then problems := problems || 'owner, security definer or search_path of manager_card_evaluate_gameweek'::text; end if;
  if exists (
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) r(role)
    where has_function_privilege(r.role, 'app_private.manager_card_evaluate_gameweek(uuid,integer)', 'execute')
  ) then problems := problems || 'manager_card_evaluate_gameweek is executable by an API role'::text; end if;
  if cardinality(problems) > 0 then
    raise exception 'stop: the migration did not check out: %', problems;
  end if;
end $verify$;

-- ---------------------------------------------------------------------------
-- Rules v4: the one insert, version 3 goes inactive (never edited)
-- ---------------------------------------------------------------------------
update app_private.manager_card_rules set active = false where version = 3 and active;
insert into app_private.manager_card_rules (version, config, active)
values (4, current_setting('manager_card.rules_v4_config')::jsonb, true);

-- ---------------------------------------------------------------------------
-- Postflight: check the result (saves nothing of its own)
-- ---------------------------------------------------------------------------
do $postflight$
declare
  cfg jsonb;
  problems text[] := '{}';
  expected_top text[] := array[
    'minimum_gameweeks', 'provisional_below', 'trf_window_gameweeks', 'batch_size', 'normalize',
    'scales', 'tiers', 'shrinkage', 'sel_numerator', 'ovr_min_stats', 'empty_stat_neutral'
  ];
  one_key text;
  ticked jsonb;
begin
  if (select count(*) from app_private.manager_card_rules) <> 4
    or (select count(*) from app_private.manager_card_rules where active) <> 1
    or not exists (select 1 from app_private.manager_card_rules where version = 4 and active) then
    raise exception 'stop: expected exactly four rules rows, version 4 the only active one';
  end if;
  if (select config from app_private.manager_card_rules where version = 1)
      is distinct from current_setting('manager_card.rules_v1_before')::jsonb
    or (select config from app_private.manager_card_rules where version = 2)
      is distinct from current_setting('manager_card.rules_v2_before')::jsonb
    or (select config from app_private.manager_card_rules where version = 3)
      is distinct from current_setting('manager_card.rules_v3_before')::jsonb then
    raise exception 'stop: rules v1, v2 or v3 changed';
  end if;
  select config into cfg from app_private.manager_card_rules where version = 4;
  if cfg is distinct from current_setting('manager_card.rules_v4_config')::jsonb then
    raise exception 'stop: the stored config differs from the pasted one';
  end if;

  for one_key in select k from jsonb_object_keys(cfg) k loop
    if one_key <> all (expected_top) then
      problems := array_append(problems, ('unknown key ' || one_key)::text);
    end if;
  end loop;
  foreach one_key in array expected_top loop
    if not cfg ? one_key then
      problems := array_append(problems, ('missing key ' || one_key)::text);
    end if;
  end loop;
  if cfg -> 'normalize' is distinct from '"gameweek_percentile"'::jsonb then
    problems := array_append(problems, 'normalize must be "gameweek_percentile" in rules v4'::text);
  end if;
  if cfg -> 'scales' -> 'cap' is distinct from '[[0,1],[0.5,50],[1,99]]'::jsonb
    or cfg -> 'scales' -> 'sel' is distinct from '[[0,1],[0.5,50],[1,99]]'::jsonb
    or cfg -> 'scales' -> 'trf' is distinct from '[[0,1],[0.5,50],[1,99]]'::jsonb
    or cfg -> 'scales' -> 'con' is distinct from '[[0,1],[1,99]]'::jsonb then
    problems := array_append(problems, 'the v4 scales must put the week''s median manager at 50 (CAP, SEL, TRF) and keep CON''s'::text);
  end if;
  if cfg -> 'tiers' is distinct from '{"stade":50,"pro":65,"champion":80,"legend":90}'::jsonb then
    problems := array_append(problems, 'rules v4 keeps the v3 tiers'::text);
  end if;
  -- The read API accepts the row (a minimum of at least 1, rising tiers).
  if not coalesce((select r.usable and r.version = 4 and r.min_rated = 1
      from app_private.manager_card_active_rules() r), false) then
    problems := array_append(problems, 'the read API does not find rules v4 usable'::text);
  end if;

  -- The switches are as they were, the tick does nothing, nothing was written.
  if (select concat_ws('#', s.compute_enabled, s.read_enabled, s.notify_ovr_changes)
      from app_private.manager_card_settings s) is distinct from current_setting('manager_card.settings_before')
    or exists (select 1 from app_private.manager_card_settings where compute_enabled) then
    problems := array_append(problems, 'a switch changed, or compute is on'::text);
  end if;
  ticked := app_private.manager_card_tick();
  if ticked is distinct from '{"outcome": "off"}'::jsonb then
    problems := array_append(problems, ('the tick answered ' || coalesce(ticked::text, 'nothing') || ' instead of off')::text);
  end if;
  if concat_ws('#',
    (select count(*) from app.manager_cards), (select count(*) from app.manager_card_seasons),
    (select count(*) from app.manager_card_gameweeks), (select count(*) from app_private.manager_card_evaluations),
    (select count(*) from app_private.manager_card_job_log), (select count(*) from app.manager_card_ovr_changes),
    (select count(*) from app_private.notification_events), (select count(*) from app.notifications))
      is distinct from current_setting('manager_card.card_before') then
    problems := array_append(problems, 'something was written to the card or the notifications'::text);
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: rules v4 did not check out: %', problems;
  end if;
  raise notice 'manager card rules v4: migration applied, body and grants as reviewed, one active row, every key valid, switches unchanged';
end
$postflight$;

-- What was verified (read this row; the transaction is rolled back below unless you changed it).
select 'All checks passed: migration 20261014160000 applied with the reviewed bytes, body and grants as reviewed, rules v4 inserted and active (v1 to v3 inactive, unchanged), compute still off and the other switches as they were. If the last line of this script says rollback; nothing was saved; if it says commit; this is now installed -- restore the writers (see the header), the tick then recalculates every finished gameweek under v4.' as result,
  (select string_agg(version::text || case when active then ' (active)' else '' end, ', ' order by version) from app_private.manager_card_rules) as rules_rows,
  (select count(*) from supabase_migrations.schema_migrations where version = '20261014160000') as migration_rows_in_this_transaction;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To install for real, change ONLY the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;
