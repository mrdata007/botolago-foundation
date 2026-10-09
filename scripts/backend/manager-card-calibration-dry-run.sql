-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Manager Card (BG-0158): CALIBRATION DRY RUN. It SAVES NOTHING.
--
-- WHAT IT IS FOR
--   The card turns four raw figures (CAP, SEL, TRF, CON) into whole numbers
--   from 1 to 99 using scales, and turns the overall rating (OVR) into a tier
--   using cut-offs. Those scales and cut-offs must come from real results, not
--   from guesses. This script runs the card's real calculation over every
--   finished Fantasy gameweek, measures how the raw figures are spread, and
--   PROPOSES the first rules (rules v1) from that spread. You review the
--   proposal; nothing is installed by this script.
--
-- WHEN
--   After the Manager Card backend is applied
--   (scripts/backend/apply-20261008123000-manager-card.sql) and while it is
--   still OFF with NO rules row; and after enough gameweeks have finished to
--   say something (the output warns when there are too few). Any quiet moment:
--   it can run for several minutes on a large season, and it takes the card's
--   advisory lock, so the 15-minute card tick (which is off anyway) and the
--   founder grant cannot run alongside it.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query.
--   2. Paste this WHOLE file and press Run.
--   3. The run ENDS WITH AN ERROR ON PURPOSE. That error IS the result: copy the
--      text after "calibration result:" (one line of JSON) and paste it back
--      into the task. If the SQL Editor times out first, run it again at a
--      quieter hour; it saves nothing, so running it twice is harmless.
--   If the error starts with "stop:", a safety check fired and nothing was
--   calculated. Do not edit a check to make it pass: it means the database is
--   not in the state this script expects.
--
-- WHAT IT PRINTS (aggregates only: no user id, name, e-mail or team)
--   * per Fantasy season: how many gameweeks counted, how many teams were
--     rated, how many weeks each team counted, how many teams made no transfer
--     (their TRF is empty), how many captain choices disagreed with the stored
--     scoring details;
--   * for each raw figure, over the teams with at least 3 counted weeks: how
--     many have a value, and the minimum, the 1st, 5th, 10th, 25th, 50th, 75th,
--     90th, 95th and 99th percentiles, and the maximum;
--   * "proposedRulesV1": the rules config this data suggests, in the exact
--     shape the card reads (scales through the 1st / 10th / 50th / 90th / 99th
--     percentiles mapped to 1 / 20 / 50 / 80 / 99; tiers from the OVR spread:
--     LEGEND = top 1%, CHAMPION = next 4%, PRO = next 15%, STADE = next 30%);
--   * "proposalCheck": the OVR spread and the tier shares that proposal gives;
--   * "warnings": anything that makes the proposal weak (few gameweeks, few
--     teams, tied values, no CAP start date yet).
--
-- WHAT IT DOES TO THE DATABASE
--   It is one DO block, which is one transaction. Inside it the card's own
--   calculation really runs (it writes the card tables and the ledger and
--   creates a temporary rules row, version 999999), and then the block ends with
--   a deliberate error, so the whole transaction rolls back and NONE of it is
--   kept: no rules row, no card, no number, no ledger row. It reads the Fantasy
--   tables and writes nothing to them. It refuses to start if a rules row
--   already exists, if compute is switched on, or if any card table already
--   holds rows. AGENTS.md counts a transaction that rolls back as a write: it
--   takes locks on the card's own tables only, so nothing else needs pausing
--   beyond the usual "nothing else is writing to this database right now".
--
-- NOT SET HERE
--   cap_ignore_deadlines_before (the owner's D12: CAP skips weeks before
--   PR #376 reached production) is left out because #376 has not shipped, so
--   the CAP figures below include weeks with a default captain nobody chose.
--   The proposal does not set it either, and says so in "warnings". Add it to
--   the config before rules v1 is installed once #376 is live (see
--   docs/backend/MANAGER_CARD_OPERATIONS_RUNBOOK.md).
-- ============================================================================

do $calibration$
declare
  -- Provisional rules used for the measurement only (version 999999).
  temp_version constant integer := 999999;
  min_weeks_for_stats constant integer := 3;   -- weeks a team needs to enter the percentiles and the proposal
  temp_config constant jsonb := jsonb_build_object(
    'minimum_gameweeks', 1,
    'provisional_below', 1,
    'trf_window_gameweeks', 3,
    'scales', jsonb_build_object(
      'cap', '[[0, 1], [1, 99]]'::jsonb,
      'sel', '[[0, 1], [1, 99]]'::jsonb,
      'trf', '[[-10, 1], [10, 99]]'::jsonb,
      'con', '[[0, 1], [1, 99]]'::jsonb
    ),
    'tiers', jsonb_build_object('stade', 50, 'pro', 65, 'champion', 78, 'legend', 88),
    'batch_size', 1000000000
  );
  warnings text[] := '{}';
  season record;
  gameweek record;
  outcome jsonb;
  evaluated_total integer := 0;
  season_gameweeks jsonb := '{}';     -- fantasy season id -> gameweeks evaluated
  season_mismatch jsonb := '{}';      -- fantasy season id -> cap mismatches at the last gameweek
  stat text;
  pc double precision[];
  n_stat integer;
  stat_points jsonb;
  stat_distinct integer;
  stat_tied boolean;
  scales jsonb := '{}';
  default_scale jsonb;
  tiers jsonb;
  ovr_n integer;
  ovr_p double precision[];
  t_legend integer; t_champion integer; t_pro integer; t_stade integer;
  adjusted boolean := false;
  pooled_teams integer;
  pooled_seasons integer;
  season_labels text;
  seasons_json jsonb;
  proposed jsonb;
  check_json jsonb;
  result jsonb;
  text_out text;
begin
  -- Time limits for this run only.
  perform set_config('statement_timeout', '10min', true);
  perform set_config('lock_timeout', '10s', true);

  -- -------------------------------------------------------------------------
  -- Safety checks (a different prefix from the final result on purpose)
  -- -------------------------------------------------------------------------
  if to_regprocedure('app_private.manager_card_evaluate_gameweek(uuid,integer)') is null
    or to_regclass('app_private.manager_card_rules') is null then
    raise exception 'stop: the Manager Card backend is not applied on this database';
  end if;
  if exists (select 1 from app_private.manager_card_rules) then
    raise exception 'stop: a rules row already exists -- this dry run is for before rules v1';
  end if;
  if exists (select 1 from app_private.manager_card_settings where compute_enabled) then
    raise exception 'stop: compute is switched on -- switch it off first (select app_private.manager_card_configure(false, null);)';
  end if;
  if exists (select 1 from app.manager_card_seasons)
    or exists (select 1 from app.manager_card_gameweeks)
    or exists (select 1 from app_private.manager_card_evaluations) then
    raise exception 'stop: a card table already holds rows -- this dry run expects them empty';
  end if;

  -- -------------------------------------------------------------------------
  -- Temporary rules row (rolled back with everything else)
  -- -------------------------------------------------------------------------
  insert into app_private.manager_card_rules (version, config, active)
  values (temp_version, temp_config, true);

  -- -------------------------------------------------------------------------
  -- Run the real calculation, gameweek by gameweek, in sequence order.
  -- "Evaluable" is the tick's own test: finalized or corrected, final points,
  -- and the postwork of the CURRENT scoring version completed.
  -- -------------------------------------------------------------------------
  for season in
    select fs.id
    from app.fantasy_seasons fs
    where fs.status <> 'cancelled'
    order by fs.starts_at, fs.id
  loop
    for gameweek in
      select gw.id, gw.sequence_number
      from app.fantasy_gameweeks gw
      where gw.fantasy_season_id = season.id
        and gw.status in ('finalized', 'corrected') and gw.points_state = 'final'
        and exists (
          select 1 from app_private.fantasy_gameweek_postwork work
          where work.gameweek_id = gw.id and work.calculation_version = gw.scoring_input_version
            and work.completed_at is not null
        )
      order by gw.sequence_number
    loop
      outcome := app_private.manager_card_evaluate_gameweek(gameweek.id, temp_version);
      if outcome ->> 'outcome' is distinct from 'evaluated' then
        raise exception 'stop: gameweek % of a season did not evaluate (%) -- run again later when nothing is writing',
          gameweek.sequence_number, coalesce(outcome ->> 'outcome', 'no answer');
      end if;
      evaluated_total := evaluated_total + 1;
      season_gameweeks := jsonb_set(season_gameweeks, array[season.id::text],
        to_jsonb(coalesce((season_gameweeks ->> season.id::text)::integer, 0) + 1));
      season_mismatch := jsonb_set(season_mismatch, array[season.id::text],
        to_jsonb((outcome ->> 'capMismatches')::integer));
    end loop;
  end loop;

  -- -------------------------------------------------------------------------
  -- Aggregates per season (teams with at least min_weeks_for_stats counted weeks)
  -- -------------------------------------------------------------------------
  select coalesce(jsonb_agg(per_season.entry order by per_season.starts_at, per_season.label), '[]'::jsonb)
  into seasons_json
  from (
    select fs.starts_at, coalesce(sn.label, fs.name) as label,
      jsonb_build_object(
        'label', coalesce(sn.label, fs.name),
        'gameweeks', coalesce((season_gameweeks ->> fs.id::text)::integer, 0),
        'teamsRated', (select count(*) from app.manager_card_seasons ms where ms.fantasy_season_id = fs.id),
        'teamsAtMinimum', (select count(*) from app.manager_card_seasons ms
          where ms.fantasy_season_id = fs.id and ms.gameweeks_counted >= min_weeks_for_stats),
        'weeksCounted', coalesce((
          select jsonb_object_agg(d.weeks::text, d.teams order by d.weeks)
          from (select ms.gameweeks_counted as weeks, count(*) as teams
            from app.manager_card_seasons ms where ms.fantasy_season_id = fs.id
            group by ms.gameweeks_counted) d
        ), '{}'::jsonb),
        'teamsWithoutTransfer', (select count(*) from app.manager_card_seasons ms
          where ms.fantasy_season_id = fs.id and ms.gameweeks_counted >= min_weeks_for_stats and ms.trf_raw is null),
        'capMismatchTeamWeeks', coalesce((season_mismatch ->> fs.id::text)::integer, 0),
        'stats', (
          select jsonb_object_agg(s.stat, jsonb_build_object(
            'n', s.n,
            'min', round(s.lo::numeric, 4),
            'p1', round((s.pc)[1]::numeric, 4), 'p5', round((s.pc)[2]::numeric, 4),
            'p10', round((s.pc)[3]::numeric, 4), 'p25', round((s.pc)[4]::numeric, 4),
            'p50', round((s.pc)[5]::numeric, 4), 'p75', round((s.pc)[6]::numeric, 4),
            'p90', round((s.pc)[7]::numeric, 4), 'p95', round((s.pc)[8]::numeric, 4),
            'p99', round((s.pc)[9]::numeric, 4),
            'max', round(s.hi::numeric, 4)))
          from (
            select x.stat, count(x.v) as n, min(x.v) as lo, max(x.v) as hi,
              percentile_cont(array[0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99])
                within group (order by x.v) as pc
            from app.manager_card_seasons ms
            cross join lateral (values
              ('cap', ms.cap_raw::double precision), ('sel', ms.sel_raw::double precision),
              ('trf', ms.trf_raw::double precision), ('con', ms.con_raw::double precision)
            ) x(stat, v)
            where ms.fantasy_season_id = fs.id and ms.gameweeks_counted >= min_weeks_for_stats
            group by x.stat
          ) s
        )
      ) as entry
    from app.fantasy_seasons fs
    left join app.seasons sn on sn.id = fs.football_season_id
    where fs.status <> 'cancelled'
      and ((season_gameweeks ->> fs.id::text) is not null
        or exists (select 1 from app.manager_card_seasons ms where ms.fantasy_season_id = fs.id))
  ) per_season;

  select count(*), count(distinct ms.fantasy_season_id),
    string_agg(distinct coalesce(sn.label, fs.name), ', ')
  into pooled_teams, pooled_seasons, season_labels
  from app.manager_card_seasons ms
  join app.fantasy_seasons fs on fs.id = ms.fantasy_season_id
  left join app.seasons sn on sn.id = fs.football_season_id
  where ms.gameweeks_counted >= min_weeks_for_stats;

  -- -------------------------------------------------------------------------
  -- Proposed scales: raw p1 -> 1, p10 -> 20, p50 -> 50, p90 -> 80, p99 -> 99,
  -- pooled over every non-cancelled season (teams with >= 3 counted weeks).
  -- Equal raw values are merged into one point (the mean of their scores) so
  -- that x strictly increases.
  -- -------------------------------------------------------------------------
  foreach stat in array array['cap', 'sel', 'trf', 'con'] loop
    default_scale := case stat
      when 'trf' then '[[-10, 1], [10, 99]]'::jsonb else '[[0, 1], [1, 99]]'::jsonb end;
    select count(v), percentile_cont(array[0.01, 0.10, 0.50, 0.90, 0.99]) within group (order by v)
    into n_stat, pc
    from (
      select case stat when 'cap' then ms.cap_raw when 'sel' then ms.sel_raw
        when 'trf' then ms.trf_raw else ms.con_raw end::double precision as v
      from app.manager_card_seasons ms
      where ms.gameweeks_counted >= min_weeks_for_stats
    ) q;
    if n_stat is null or n_stat < 2 or pc is null then
      scales := scales || jsonb_build_object(stat, default_scale);
      warnings := array_append(warnings, (format('scale %s: fewer than 2 values, the placeholder scale was kept -- do not install it', stat))::text);
      continue;
    end if;
    select jsonb_agg(jsonb_build_array(g.x, g.y) order by g.x), count(*), count(*) < 5
    into stat_points, stat_distinct, stat_tied
    from (
      select p.x, round(avg(p.y)) as y
      from (values
        (round(pc[1]::numeric, 4), 1), (round(pc[2]::numeric, 4), 20), (round(pc[3]::numeric, 4), 50),
        (round(pc[4]::numeric, 4), 80), (round(pc[5]::numeric, 4), 99)
      ) p(x, y)
      group by p.x
    ) g;
    if stat_distinct < 2 then
      scales := scales || jsonb_build_object(stat, default_scale);
      warnings := array_append(warnings, (format('scale %s: every percentile is the same value, the placeholder scale was kept -- do not install it', stat))::text);
    else
      scales := scales || jsonb_build_object(stat, stat_points);
      if stat_tied then
        warnings := array_append(warnings, (format('scale %s: tied percentiles were merged, it has only %s distinct points', stat, stat_distinct))::text);
      end if;
    end if;
  end loop;

  -- -------------------------------------------------------------------------
  -- Proposed tiers: OVR of every team (>= 3 counted weeks) with those scales
  -- -------------------------------------------------------------------------
  select count(o.ovr),
    percentile_disc(array[0.50, 0.80, 0.95, 0.99]) within group (order by o.ovr)
  into ovr_n, ovr_p
  from (
    select case when s.k >= 3 then round(
        (coalesce(s.cap, 0) + coalesce(s.sel, 0) + coalesce(s.trf, 0) + coalesce(s.con, 0))::numeric / s.k
      )::integer end as ovr
    from (
      select sc.cap, sc.sel, sc.trf, sc.con,
        (sc.cap is not null)::integer + (sc.sel is not null)::integer
          + (sc.trf is not null)::integer + (sc.con is not null)::integer as k
      from (
        select app_private.manager_card_scale(ms.cap_raw, scales -> 'cap') as cap,
          app_private.manager_card_scale(ms.sel_raw, scales -> 'sel') as sel,
          app_private.manager_card_scale(ms.trf_raw, scales -> 'trf') as trf,
          app_private.manager_card_scale(ms.con_raw, scales -> 'con') as con
        from app.manager_card_seasons ms
        where ms.gameweeks_counted >= min_weeks_for_stats
      ) sc
    ) s
  ) o;

  if ovr_n is null or ovr_n = 0 or ovr_p is null then
    t_stade := 50; t_pro := 65; t_champion := 78; t_legend := 88;
    warnings := array_append(warnings, ('tiers: no team has an OVR yet, the placeholder cut-offs were kept -- do not install them')::text);
  else
    t_stade := ovr_p[1]::integer;
    t_pro := ovr_p[2]::integer;
    t_champion := ovr_p[3]::integer;
    t_legend := ovr_p[4]::integer;
    -- strictly increasing and inside 1..99, adjusting downwards from the top
    if t_legend > 99 then t_legend := 99; adjusted := true; end if;
    if t_champion >= t_legend then t_champion := t_legend - 1; adjusted := true; end if;
    if t_pro >= t_champion then t_pro := t_champion - 1; adjusted := true; end if;
    if t_stade >= t_pro then t_stade := t_pro - 1; adjusted := true; end if;
    if t_stade < 1 then
      t_stade := 1; t_pro := 2; t_champion := 3; t_legend := 4; adjusted := true;
      warnings := array_append(warnings, ('tiers: the OVR values are too bunched to separate four cut-offs, they were forced to 1,2,3,4 -- do not install them')::text);
    elsif adjusted then
      warnings := array_append(warnings, ('tiers: tied OVR values at the cut-offs were nudged so the cut-offs rise strictly; check tierShares')::text);
    end if;
  end if;
  tiers := jsonb_build_object('stade', t_stade, 'pro', t_pro, 'champion', t_champion, 'legend', t_legend);

  proposed := jsonb_build_object(
    'minimum_gameweeks', 3,
    'provisional_below', 5,
    'trf_window_gameweeks', 3,
    'scales', scales,
    'tiers', tiers,
    'batch_size', 2000
  );

  -- How the proposal would spread the teams
  select jsonb_build_object(
      'teamsWithOvr', count(*),
      'ovrMin', min(o.ovr), 'ovrP50', percentile_disc(0.50) within group (order by o.ovr),
      'ovrP95', percentile_disc(0.95) within group (order by o.ovr),
      'ovrP99', percentile_disc(0.99) within group (order by o.ovr), 'ovrMax', max(o.ovr),
      'tierShares', jsonb_build_object(
        'legend', round(100.0 * count(*) filter (where o.ovr >= t_legend) / nullif(count(*), 0), 2),
        'champion', round(100.0 * count(*) filter (where o.ovr >= t_champion and o.ovr < t_legend) / nullif(count(*), 0), 2),
        'pro', round(100.0 * count(*) filter (where o.ovr >= t_pro and o.ovr < t_champion) / nullif(count(*), 0), 2),
        'stade', round(100.0 * count(*) filter (where o.ovr >= t_stade and o.ovr < t_pro) / nullif(count(*), 0), 2),
        'homa', round(100.0 * count(*) filter (where o.ovr < t_stade) / nullif(count(*), 0), 2)),
      'aimPercent', jsonb_build_object('legend', 1, 'champion', 4, 'pro', 15, 'stade', 30, 'homa', 50))
  into check_json
  from (
    select case when s.k >= 3 then round(
        (coalesce(s.cap, 0) + coalesce(s.sel, 0) + coalesce(s.trf, 0) + coalesce(s.con, 0))::numeric / s.k
      )::integer end as ovr
    from (
      select sc.cap, sc.sel, sc.trf, sc.con,
        (sc.cap is not null)::integer + (sc.sel is not null)::integer
          + (sc.trf is not null)::integer + (sc.con is not null)::integer as k
      from (
        select app_private.manager_card_scale(ms.cap_raw, scales -> 'cap') as cap,
          app_private.manager_card_scale(ms.sel_raw, scales -> 'sel') as sel,
          app_private.manager_card_scale(ms.trf_raw, scales -> 'trf') as trf,
          app_private.manager_card_scale(ms.con_raw, scales -> 'con') as con
        from app.manager_card_seasons ms
        where ms.gameweeks_counted >= min_weeks_for_stats
      ) sc
    ) s
  ) o
  where o.ovr is not null;

  -- -------------------------------------------------------------------------
  -- Warnings
  -- -------------------------------------------------------------------------
  if evaluated_total = 0 then
    warnings := array_append(warnings, ('no gameweek is evaluable yet (finalized, final points, postwork completed): there is nothing to calibrate on')::text);
  end if;
  if exists (
    select 1 from jsonb_array_elements(seasons_json) e where (e ->> 'gameweeks')::integer < 5
  ) then
    warnings := array_append(warnings, ('a season has fewer than 5 finished gameweeks: the figures are early and noisy, calibrate later if you can')::text);
  end if;
  if coalesce(pooled_teams, 0) < 100 then
    warnings := array_append(warnings, (format('only %s teams have %s or more counted weeks: percentiles are unreliable below about 100 teams',
      coalesce(pooled_teams, 0), min_weeks_for_stats))::text);
  end if;
  if coalesce(pooled_seasons, 0) > 1 then
    warnings := array_append(warnings, (format('the proposal pools %s seasons (%s); calibrate on the season that will go live if the others are tests',
      pooled_seasons, season_labels))::text);
  end if;
  warnings := array_append(warnings, ('cap_ignore_deadlines_before is NOT set: PR #376 has not shipped, so CAP includes weeks with a default captain; add the date to the config before installing rules v1')::text);
  if exists (
    select 1 from jsonb_array_elements(seasons_json) e where (e ->> 'capMismatchTeamWeeks')::integer > 0
  ) then
    warnings := array_append(warnings, ('some captain choices disagree with the stored scoring details (capMismatchTeamWeeks): those weeks were skipped, tell the card owner')::text);
  end if;

  result := jsonb_build_object(
    'rulesVersionUsedForMeasuring', temp_version,
    'gameweeksEvaluated', evaluated_total,
    'minimumWeeksForStats', min_weeks_for_stats,
    'capIgnoreDeadlinesBefore', null,
    'seasons', seasons_json,
    'proposedRulesV1', proposed,
    'proposalCheck', check_json,
    'warnings', to_jsonb(warnings)
  );

  -- Compact: no space after ":" or after "," before a key.
  text_out := replace(replace(replace(result::text, '": ', '":'), ', "', ',"'), '], [', '],[');

  -- Deliberate: the error rolls the whole transaction back. Nothing is kept.
  raise exception 'calibration result: %', text_out;
end
$calibration$;
