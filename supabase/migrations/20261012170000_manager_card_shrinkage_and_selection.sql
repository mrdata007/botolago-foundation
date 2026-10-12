-- Manager Card: calmer early scores and a fairer Selection (rules v2).
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
