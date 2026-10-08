-- Manager Card (BG-0158), part 3: the calculation, the tick, the number and the
-- founder grant.
--
-- WHAT THIS ADDS. Functions only, all in app_private, all security definer with
-- search_path = '', owned by postgres and executable by postgres alone (no
-- public, anon, authenticated or service_role grant). No table, row, trigger or
-- schedule is created here: the tables are 20261008123000, the scheduled jobs
-- 20261008123400. Nothing here runs until the owner switches compute on
-- (app_private.manager_card_configure) AND inserts an active ruleset row; until
-- then the tick answers `off` / `no_rules` and writes nothing.
--
-- DISPLAY ONLY, READ ONLY TOWARDS FANTASY. The functions read Fantasy tables and
-- write only app.manager_cards, app.manager_card_seasons,
-- app.manager_card_gameweeks, app_private.manager_card_evaluations and
-- app_private.manager_card_job_log. They never write a Fantasy table, and no
-- Fantasy, prize, league or ranking function calls them.
--
-- THE CALCULATION (docs/backend/MANAGER_CARD_DOMAIN_PLAN.md section 3).
--   evaluable gameweek: status in ('finalized','corrected'), points_state =
--     'final', and the postwork row for its CURRENT scoring_input_version has
--     completed_at set. Cancelled gameweeks never count.
--   evaluate_gameweek(G, rules_version) takes every evaluable gameweek of G's
--     season up to and including G, and recomputes each team's figures from all
--     of those rows (never by deltas), for the active teams that have a final
--     result in G and whose profile is not marked deleted:
--     CAP  captain's final points / best starter's final points, per week;
--          the vice counts only when the captain played 0 minutes; both 0 or
--          best <= 0 skips the week; a scoring_details effectiveCaptainId that
--          disagrees skips the week and is counted in the result; weeks whose
--          deadline precedes config.cap_ignore_deadlines_before are skipped.
--     SEL  starting_points / best legal eleven from the lineup's fifteen
--          (formations from fantasy_position_rules), Bench Boost weeks and
--          optimum <= 0 skipped, clamped to 0..1.
--     TRF  per transfer of a confirmed, non-Free-Hit batch: in-player points
--          minus out-player points over the batch's window of
--          config.trf_window_gameweeks non-cancelled gameweeks, minus
--          point_hit / transfers_count. A batch counts once its whole window is
--          evaluable, or once the season's last gameweek is; no batch: null.
--     CON  share of weeks in the top half of all ACTIVE teams' final results
--          that gameweek (ties in the manager's favour).
--     Each raw figure goes through its piecewise-linear scale to 1..99; OVR is
--     the rounded mean of the non-null stats (null under three); the tier
--     comes from the cut-offs. Under config.minimum_gameweeks counted weeks
--     everything is null; under config.provisional_below the card is
--     provisional. Every threshold is read from the ruleset's config.
--   The scoring_input_version of the season's gameweeks is fingerprinted before
--     and after the calculation; if it moved, nothing is written and the answer
--     is `version_changed`. The ledger row stores the version that was read, so
--     any change that slips past is evaluated again on the next tick.
--   Idempotent: rows are rewritten only when a figure differs, so a second run
--     leaves every row, calculated_at included, as it was.
--
-- LOAD. Recomputing from all rows costs O(teams x gameweeks so far) per
-- evaluated gameweek. A gameweek is never split; config.batch_size is the
-- number of teams after which the tick starts no further gameweek (the first is
-- always evaluated). Size it on a large fixture before switching on.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function app_private.manager_card_config_number(p_config jsonb, p_key text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_config is null or jsonb_typeof(p_config -> p_key) is distinct from 'number' then
    raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
  end if;
  return (p_config ->> p_key)::numeric;
end;
$$;

-- Piecewise-linear scale: p_points is [[raw, score], ...]; values outside the
-- first and last raw are clamped; the result is rounded and kept in 1..99.
create function app_private.manager_card_scale(p_raw numeric, p_points jsonb)
returns smallint
language plpgsql
immutable
set search_path = ''
as $$
declare
  lo_x numeric; lo_y numeric; hi_x numeric; hi_y numeric; result numeric;
begin
  if p_raw is null then
    return null;
  end if;
  if jsonb_typeof(p_points) is distinct from 'array' or jsonb_array_length(p_points) < 2
    or exists (
      select 1 from jsonb_array_elements(p_points) point
      where jsonb_typeof(point) is distinct from 'array'
        or jsonb_array_length(point) <> 2
        or jsonb_typeof(point -> 0) is distinct from 'number'
        or jsonb_typeof(point -> 1) is distinct from 'number'
    ) then
    raise exception using errcode = 'PT400', message = 'manager_card_rules_invalid';
  end if;
  select (point ->> 0)::numeric, (point ->> 1)::numeric into lo_x, lo_y
  from jsonb_array_elements(p_points) point
  where (point ->> 0)::numeric <= p_raw
  order by (point ->> 0)::numeric desc, (point ->> 1)::numeric desc limit 1;
  select (point ->> 0)::numeric, (point ->> 1)::numeric into hi_x, hi_y
  from jsonb_array_elements(p_points) point
  where (point ->> 0)::numeric > p_raw
  order by (point ->> 0)::numeric asc, (point ->> 1)::numeric asc limit 1;
  if lo_x is null then
    result := hi_y;
  elsif hi_x is null then
    result := lo_y;
  else
    result := lo_y + (hi_y - lo_y) * (p_raw - lo_x) / (hi_x - lo_x);
  end if;
  return least(99, greatest(1, round(result)))::smallint;
end;
$$;

-- Tier from OVR: p_tiers is {"stade": n, "pro": n, "champion": n, "legend": n}
-- (the lowest OVR of each tier); everything below stade is homa.
create function app_private.manager_card_tier(p_ovr integer, p_tiers jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  legend numeric := app_private.manager_card_config_number(p_tiers, 'legend');
  champion numeric := app_private.manager_card_config_number(p_tiers, 'champion');
  pro numeric := app_private.manager_card_config_number(p_tiers, 'pro');
  stade numeric := app_private.manager_card_config_number(p_tiers, 'stade');
begin
  if p_ovr is null then
    return null;
  end if;
  return case
    when p_ovr >= legend then 'legend'
    when p_ovr >= champion then 'champion'
    when p_ovr >= pro then 'pro'
    when p_ovr >= stade then 'stade'
    else 'homa'
  end;
end;
$$;

-- A fingerprint of everything that decides whether a gameweek is evaluable and
-- which scoring it was evaluated on, for one season.
create function app_private.manager_card_season_fingerprint(p_fantasy_season_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(md5(string_agg(
    gameweek.id::text || ':' || gameweek.status::text || ':' || gameweek.points_state::text
      || ':' || gameweek.scoring_input_version::text || ':' || coalesce(work.completed_at::text, ''),
    ',' order by gameweek.id
  )), '')
  from app.fantasy_gameweeks gameweek
  left join app_private.fantasy_gameweek_postwork work
    on work.gameweek_id = gameweek.id and work.calculation_version = gameweek.scoring_input_version
  where gameweek.fantasy_season_id = p_fantasy_season_id;
$$;

-- ---------------------------------------------------------------------------
-- The permanent number: random 100000-999999, unused, never retired
-- ---------------------------------------------------------------------------
create function app_private.manager_card_assign_serial(p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_serial text;
  candidate text;
  bytes bytea;
  attempt integer := 0;
begin
  if p_user_id is null then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  -- The card row is created here when it does not exist yet.
  insert into app.manager_cards (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select card.serial into current_serial from app.manager_cards card where card.user_id = p_user_id;
  if current_serial is not null then
    return current_serial;
  end if;
  loop
    attempt := attempt + 1;
    if attempt > 100 then
      raise exception using errcode = 'PT409', message = 'manager_card_serial_unavailable';
    end if;
    bytes := extensions.gen_random_bytes(4);
    candidate := (
      100000 + (
        (get_byte(bytes, 0)::bigint * 16777216 + get_byte(bytes, 1)::bigint * 65536
          + get_byte(bytes, 2)::bigint * 256 + get_byte(bytes, 3)::bigint) % 900000
      )
    )::text;
    if exists (select 1 from app.manager_cards card where card.serial = candidate)
      or exists (select 1 from app_private.manager_card_retired_serials retired where retired.serial = candidate) then
      continue;
    end if;
    begin
      update app.manager_cards set serial = candidate
      where user_id = p_user_id and serial is null;
      select card.serial into current_serial from app.manager_cards card where card.user_id = p_user_id;
      return current_serial;
    exception when unique_violation then
      -- Another writer took the number between the check and the write: draw again.
      null;
    end;
  end loop;
  return current_serial;
end;
$$;

-- Drops the calculation's temporary tables. Dynamic because they exist only at
-- run time (the static checks cannot see them).
create function app_private.manager_card_drop_temp()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  execute 'drop table if exists pg_temp.mc_gws, pg_temp.mc_all, pg_temp.mc_teams, pg_temp.mc_res, pg_temp.mc_pts, '
    'pg_temp.mc_lp, pg_temp.mc_cap, pg_temp.mc_form, pg_temp.mc_lpos, pg_temp.mc_best, pg_temp.mc_sel, '
    'pg_temp.mc_con, pg_temp.mc_trf, pg_temp.mc_fig';
end;
$$;

-- ---------------------------------------------------------------------------
-- Evaluate one gameweek
-- ---------------------------------------------------------------------------
create function app_private.manager_card_evaluate_gameweek(p_gameweek_id uuid, p_rules_version integer)
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
    least(1, greatest(0, r.starting_points::numeric / b.best)) as ratio
  from pg_temp.mc_res r
  join pg_temp.mc_best b on b.lineup_id = r.lineup_id
  where r.chip_type is distinct from 'bench_boost' and b.best > 0
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;

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
    select team_id, round(avg(ratio), 6) as v from pg_temp.mc_cap where ratio is not null group by team_id
  ), sel_avg as (
    select team_id, round(avg(ratio), 6) as v from pg_temp.mc_sel group by team_id
  ), trf_avg as (
    select team_id, round(avg(value), 6) as v from pg_temp.mc_trf group by team_id
  ), con_avg as (
    select team_id, round(avg(case when top_half then 1 else 0 end), 6) as v from pg_temp.mc_con group by team_id
  ), raw as (
    select t.team_id, t.user_id, coalesce(c.counted, 0) as counted,
      cap_avg.v as cap_raw, sel_avg.v as sel_raw, trf_avg.v as trf_raw, con_avg.v as con_raw
    from pg_temp.mc_teams t
    left join counted c on c.team_id = t.team_id
    left join cap_avg on cap_avg.team_id = t.team_id
    left join sel_avg on sel_avg.team_id = t.team_id
    left join trf_avg on trf_avg.team_id = t.team_id
    left join con_avg on con_avg.team_id = t.team_id
  ), gated as (
    select raw.team_id, raw.user_id, raw.counted,
      case when raw.counted >= $8 then raw.cap_raw end as cap_raw,
      case when raw.counted >= $8 then raw.sel_raw end as sel_raw,
      case when raw.counted >= $8 then raw.trf_raw end as trf_raw,
      case when raw.counted >= $8 then raw.con_raw end as con_raw
    from raw
  ), scaled as (
    select g.*,
      app_private.manager_card_scale(g.cap_raw, $10 -> 'cap') as cap,
      app_private.manager_card_scale(g.sel_raw, $10 -> 'sel') as sel,
      app_private.manager_card_scale(g.trf_raw, $10 -> 'trf') as trf,
      app_private.manager_card_scale(g.con_raw, $10 -> 'con') as con
    from gated g
  ), rated as (
    select s.*,
      case when (s.cap is not null)::integer + (s.sel is not null)::integer
        + (s.trf is not null)::integer + (s.con is not null)::integer >= 3
      then round((coalesce(s.cap, 0) + coalesce(s.sel, 0) + coalesce(s.trf, 0) + coalesce(s.con, 0))::numeric
        / ((s.cap is not null)::integer + (s.sel is not null)::integer
          + (s.trf is not null)::integer + (s.con is not null)::integer))::smallint
      end as ovr
    from scaled s
  )
  select r.team_id, r.user_id, r.counted, r.cap_raw, r.sel_raw, r.trf_raw, r.con_raw,
    r.cap, r.sel, r.trf, r.con, r.ovr,
    app_private.manager_card_tier(r.ovr, $11) as tier,
    (r.counted < $9) as provisional
  from rated r
  $q$, '') using season.id, gw.id, gw.sequence_number, season.ruleset_id, cap_ignore, trf_window, last_seq, min_weeks, provisional_below, scales, tiers, p_rules_version;
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

-- ---------------------------------------------------------------------------
-- The tick
-- ---------------------------------------------------------------------------
create function app_private.manager_card_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.manager_card_settings%rowtype;
  rules app_private.manager_card_rules%rowtype;
  started timestamptz := statement_timestamp();
  batch_size integer;
  stale record;
  outcome jsonb;
  blocked uuid[] := array[]::uuid[];
  gameweeks integer := 0;
  teams integer := 0;
  cards integer := 0;
  history integer := 0;
  mismatches integer := 0;
  failed integer := 0;
  skipped integer := 0;
  more boolean := false;
  last_state text;
  result_outcome text;
  detail jsonb;
begin
  -- None of the first three answers writes anything, the job log included.
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:manager-card', 0)) then
    return jsonb_build_object('outcome', 'busy');
  end if;
  select * into settings from app_private.manager_card_settings where id;
  if not found or not settings.compute_enabled then
    return jsonb_build_object('outcome', 'off');
  end if;
  select * into rules from app_private.manager_card_rules where active;
  if not found then
    return jsonb_build_object('outcome', 'no_rules');
  end if;
  batch_size := app_private.manager_card_config_number(rules.config, 'batch_size')::integer;

  -- Evaluable gameweeks with no ledger row for the active rules and their
  -- current scoring_input_version, every later evaluable gameweek of the same
  -- season (a correction re-evaluates that gameweek and all after it), and any
  -- gameweek whose ledger entry is older than an earlier gameweek's (a cascade
  -- a previous tick left unfinished).
  for stale in
    select marked.gameweek_id, marked.fantasy_season_id
    from (
      select gw.id as gameweek_id, gw.fantasy_season_id, gw.sequence_number, season.starts_at,
        bool_or(ledger.gameweek_id is null) over (
          partition by gw.fantasy_season_id order by gw.sequence_number
        ) or coalesce(max(ledger.evaluated_at) over (
          partition by gw.fantasy_season_id order by gw.sequence_number
          rows between unbounded preceding and 1 preceding
        ) > ledger.evaluated_at, false) as is_stale
      from app.fantasy_gameweeks gw
      join app.fantasy_seasons season on season.id = gw.fantasy_season_id and season.status <> 'cancelled'
      left join app_private.manager_card_evaluations ledger
        on ledger.gameweek_id = gw.id and ledger.rules_version = rules.version
          and ledger.scoring_input_version = gw.scoring_input_version
      where gw.status in ('finalized', 'corrected') and gw.points_state = 'final'
        and exists (
          select 1 from app_private.fantasy_gameweek_postwork work
          where work.gameweek_id = gw.id and work.calculation_version = gw.scoring_input_version
            and work.completed_at is not null
        )
    ) marked
    where marked.is_stale
    order by marked.starts_at, marked.fantasy_season_id, marked.sequence_number
  loop
    if stale.fantasy_season_id = any (blocked) then
      continue;
    end if;
    if teams >= batch_size then
      more := true;
      exit;
    end if;
    begin
      outcome := app_private.manager_card_evaluate_gameweek(stale.gameweek_id, rules.version);
    exception when others then
      failed := failed + 1;
      last_state := sqlstate;
      blocked := blocked || stale.fantasy_season_id;
      continue;
    end;
    if outcome ->> 'outcome' = 'evaluated' then
      gameweeks := gameweeks + 1;
      teams := teams + (outcome ->> 'teams')::integer;
      cards := cards + (outcome ->> 'cardsWritten')::integer;
      history := history + (outcome ->> 'historyWritten')::integer;
      mismatches := mismatches + (outcome ->> 'capMismatches')::integer;
    else
      skipped := skipped + 1;
      last_state := outcome ->> 'outcome';
      blocked := blocked || stale.fantasy_season_id;
    end if;
  end loop;

  if gameweeks = 0 and failed = 0 and skipped = 0 then
    return jsonb_build_object('outcome', 'idle');
  end if;

  result_outcome := case
    when failed > 0 then 'error'
    when skipped > 0 then 'skipped'
    when more then 'more_pending'
    else 'evaluated'
  end;
  detail := jsonb_build_object(
    'rulesVersion', rules.version,
    'gameweeks', gameweeks,
    'teams', teams,
    'cardsWritten', cards,
    'historyWritten', history,
    'capMismatches', mismatches,
    'failed', failed,
    'skipped', skipped,
    'morePending', more
  );
  if last_state is not null then
    detail := detail || jsonb_build_object('lastState', last_state);
  end if;
  insert into app_private.manager_card_job_log (started_at, finished_at, outcome, detail)
  values (started, statement_timestamp(), result_outcome, detail);
  return jsonb_build_object('outcome', result_outcome) || detail;
end;
$$;

-- ---------------------------------------------------------------------------
-- The founder grant: once, run by the owner, never overwrites a founder
-- ---------------------------------------------------------------------------
create function app_private.manager_card_grant_founder(
  p_fantasy_season_id uuid,
  p_cutoff timestamptz,
  p_cohort smallint,
  p_excluded_user_ids uuid[]
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  granted_ids uuid[];
  granted_count integer;
  one_id uuid;
begin
  if p_fantasy_season_id is null or p_cutoff is null or p_cohort is null or p_cohort < 1 then
    raise exception using errcode = 'PT400', message = 'validation_failed';
  end if;
  if not exists (select 1 from app.fantasy_seasons season where season.id = p_fantasy_season_id) then
    raise exception using errcode = 'PT404', message = 'fantasy_season_not_found';
  end if;
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:manager-card', 0)) then
    raise exception using errcode = 'PT409', message = 'manager_card_busy';
  end if;

  with eligible as (
    select distinct team.user_id
    from app.fantasy_teams team
    join app.profiles profile on profile.id = team.user_id and profile.deleted_at is null
    where team.fantasy_season_id = p_fantasy_season_id
      and team.created_at < p_cutoff
      and exists (
        select 1 from app.fantasy_team_gameweek_results result
        where result.fantasy_team_id = team.id and result.state = 'final'
      )
      and team.user_id <> all (coalesce(p_excluded_user_ids, '{}'::uuid[]))
      and not exists (
        select 1 from app_private.staff_principals principal where principal.auth_user_id = team.user_id
      )
      and not exists (
        select 1 from auth.users account
        where account.id = team.user_id and lower(coalesce(account.email, '')) like '%@botolago.com'
      )
  ), granted as (
    insert into app.manager_cards as card (user_id, founder_cohort, founder_granted_at)
    select eligible.user_id, p_cohort, statement_timestamp() from eligible
    on conflict (user_id) do update set
      founder_cohort = excluded.founder_cohort,
      founder_granted_at = excluded.founder_granted_at
    where card.founder_cohort is null
    returning card.user_id
  )
  select coalesce(array_agg(granted.user_id), '{}'::uuid[]), count(*)::integer
  into granted_ids, granted_count
  from granted;

  foreach one_id in array granted_ids loop
    perform app_private.manager_card_assign_serial(one_id);
  end loop;
  return granted_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owned by postgres, executable by postgres only
-- ---------------------------------------------------------------------------
revoke all on function
  app_private.manager_card_config_number(jsonb, text),
  app_private.manager_card_scale(numeric, jsonb),
  app_private.manager_card_tier(integer, jsonb),
  app_private.manager_card_season_fingerprint(uuid),
  app_private.manager_card_drop_temp(),
  app_private.manager_card_assign_serial(uuid),
  app_private.manager_card_evaluate_gameweek(uuid, integer),
  app_private.manager_card_tick(),
  app_private.manager_card_grant_founder(uuid, timestamptz, smallint, uuid[])
from public, anon, authenticated, service_role;
grant execute on function
  app_private.manager_card_config_number(jsonb, text),
  app_private.manager_card_scale(numeric, jsonb),
  app_private.manager_card_tier(integer, jsonb),
  app_private.manager_card_season_fingerprint(uuid),
  app_private.manager_card_drop_temp(),
  app_private.manager_card_assign_serial(uuid),
  app_private.manager_card_evaluate_gameweek(uuid, integer),
  app_private.manager_card_tick(),
  app_private.manager_card_grant_founder(uuid, timestamptz, smallint, uuid[])
to postgres;

comment on function app_private.manager_card_scale(numeric, jsonb) is
  'Piecewise-linear scale ([[raw, score], ...], clamped outside the first and last raw) rounded into 1..99. Null raw gives null.';
comment on function app_private.manager_card_tier(integer, jsonb) is
  'Tier from OVR and the ruleset''s cut-offs {stade, pro, champion, legend}; below stade is homa; null OVR gives null.';
comment on function app_private.manager_card_assign_serial(uuid) is
  'Gives a card its permanent number (random 100000-999999, unused, never retired), creating the card row if needed. Returns the existing number when there is one.';
comment on function app_private.manager_card_evaluate_gameweek(uuid, integer) is
  'Recomputes the Manager Card figures of the active teams with a final result in the gameweek, from every evaluable gameweek of the season up to it. Writes only card tables and the ledger; writes nothing when the scoring version moved during the run. Idempotent.';
comment on function app_private.manager_card_tick() is
  'Every 15 minutes (manager-card-tick): busy, off or no_rules answer without writing; otherwise evaluates the stale evaluable gameweeks in order up to the ruleset''s batch_size teams and logs one job-log row when it did something.';
comment on function app_private.manager_card_grant_founder(uuid, timestamptz, smallint, uuid[]) is
  'Owner-run, once: marks teams of the season created before the cut-off with a final result as founders of the cohort, excluding the given users, staff and @botolago.com accounts. Never overwrites a founder. Returns how many were granted.';
