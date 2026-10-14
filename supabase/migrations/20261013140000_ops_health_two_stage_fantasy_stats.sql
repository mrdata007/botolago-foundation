-- Ops health: SofaScore publishes Botola statistics in two stages, so
-- `fantasy_fixture_coverage` and `fantasy_scoring` judge the two stages apart.
--
-- WHY. Right after a match SofaScore has only CORE data for some matches
-- (minutes, goals, cards: the "limited" coverage); the FULL statistics (rating,
-- passes, saves, assists...) arrive 5 to 16 days later. In the code the stages
-- are the observation's simple_ready (core) and full_ready
-- (app_private.fantasy_fixture_observations, 20260927094823). A match that has
-- core data and is waiting for the rest is normal, not an incident, and
-- provisional points are points. The owner's rules of 2026-10-12:
--
--   fantasy_fixture_coverage
--     FAIL  a counted match has NO core data 12 h after full time
--           (core_data_window), or is still not full coverage 21 days after
--           kickoff (full_stats_window: "final limited").
--     WARN  a counted match has no core data 6 h after full time (the early
--           signal this check has always given; unchanged).
--     INFO  a match that has core data and is waiting for full statistics
--           within 21 days: said in the detail text, never a warning or a
--           failure.
--   fantasy_scoring
--     WARN  core points are missing 12 h after full time (plus one hour for
--           the scoring run, see below). Provisional points count as points:
--           the check no longer fails or warns because points are provisional
--           rather than final. The warnings for a counted match stuck
--           unfinished, called off or moved are unchanged (they are play, not
--           statistics).
--
-- Legacy (non-adaptive) gameweeks have one stage only: a coverage row that is
-- certified scoring_statistics_complete and reconciled is both core and full,
-- exactly as before.
--
-- THRESHOLDS are named constants, one function each, so a change is one edit
-- here and the orchestrator's mirror (scripts/backend/fantasy-season-
-- orchestrator.ts CORE_DATA_WINDOW_HOURS) names the same number:
--   fantasy_core_data_window()      12 hours   no core data: fail
--   fantasy_core_data_warn_window()  6 hours   no core data: warn
--   fantasy_full_stats_window()     21 days    still limited: fail
--   fantasy_scoring_run_grace()      1 hour    see below
--
-- THE SCORING RUN GRACE. An adaptive fixture's scoring mode is selected 12 h
-- after full time by the lifecycle worker (api.service_select_fantasy_scoring_
-- modes, run hourly by the GitHub orchestrator), and the worker publishes its
-- points only for a fixture whose mode is selected. So core points cannot
-- exist before full time + 12 h; read literally, "warn at 12 h" would warn on
-- every match for the minutes until the next worker run. The warning therefore
-- starts core_data_window + scoring_run_grace (13 h) after full time. Set the
-- grace to '0' to read the rule literally.
--
-- WHAT IS UNCHANGED. Output shape: same checks, names and statuses, same
-- detail wording where the situation is the one it described. The wrappers
-- (adaptive, account deletion, durable progression, manager card) are not
-- touched, and neither is app_private.ops_alert_tick() or the watchdog.
-- fantasy_progression is 20261013140100.
--
-- HOW IT IS APPLIED. The two checks live in
-- app_private.ops_health_checks_before_adaptive(): the 20260926113100 body as
-- patched by 20260927094823 and 20261011150000. Like those two, this patches
-- it from pg_get_functiondef instead of copying it again, and raises if an
-- expected fragment or anchor is not found, so it can never silently patch
-- nothing.

create function app_private.fantasy_core_data_window()
returns interval language sql immutable set search_path = '' as $$ select interval '12 hours' $$;
create function app_private.fantasy_core_data_warn_window()
returns interval language sql immutable set search_path = '' as $$ select interval '6 hours' $$;
create function app_private.fantasy_full_stats_window()
returns interval language sql immutable set search_path = '' as $$ select interval '21 days' $$;
create function app_private.fantasy_scoring_run_grace()
returns interval language sql immutable set search_path = '' as $$ select interval '1 hour' $$;
revoke all on function app_private.fantasy_core_data_window(), app_private.fantasy_core_data_warn_window(),
  app_private.fantasy_full_stats_window(), app_private.fantasy_scoring_run_grace()
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_core_data_window() is
  'Two-stage Fantasy alerts: a counted match with no core data (minutes, goals, cards) this long after full time fails fantasy_fixture_coverage and, with fantasy_scoring_run_grace, warns fantasy_scoring. 20261013140000.';
comment on function app_private.fantasy_core_data_warn_window() is
  'Two-stage Fantasy alerts: a counted match with no core data this long after full time warns fantasy_fixture_coverage. 20261013140000.';
comment on function app_private.fantasy_full_stats_window() is
  'Two-stage Fantasy alerts: a counted match still without full statistics this long after kickoff (final limited) fails fantasy_fixture_coverage. Waiting for them before that is information only. 20261013140000.';
comment on function app_private.fantasy_scoring_run_grace() is
  'Two-stage Fantasy alerts: how long after the core data window the scoring worker has to publish core points before fantasy_scoring warns (mode selection happens at the window, in the hourly worker run). 20261013140000.';

-- Full statistics, as the latest observation says it. Core data is
-- app_private.fantasy_fixture_health_ready (20261011150000), unchanged.
create function app_private.fantasy_fixture_full_stats(
  p_gameweek_id uuid, p_fixture_id uuid, p_legacy_ready boolean
) returns boolean language sql stable security definer set search_path = '' as $$
  select case when app_private.fantasy_adaptive_enabled(p_gameweek_id)
    then coalesce((
      select o.full_ready
      from app_private.fantasy_fixture_observations o
      where o.fixture_id = p_fixture_id
      order by o.observed_at desc, o.id desc
      limit 1), false)
    else coalesce(p_legacy_ready, false) end;
$$;
revoke all on function app_private.fantasy_fixture_full_stats(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
comment on function app_private.fantasy_fixture_full_stats(uuid, uuid, boolean) is
  'Ops health only: whether a counted fixture has FULL statistics. Adaptive gameweek: its latest observation is full_ready. Otherwise the legacy answer (complete statistics are the only stage). 20261013140000.';

do $two_stage_alerts$
declare
  definition text := pg_get_functiondef('app_private.ops_health_checks_before_adaptive()'::regprocedure);
  patched text;
  start_at integer;
  end_at integer;
  new_coverage text;
  new_comment text;
  old_verdict text;
  new_verdict text;
  new_detail text;
begin
  if to_regprocedure('app_private.fantasy_fixture_health_ready(uuid,uuid,boolean)') is null
    or to_regprocedure('app_private.fantasy_live_scoring_enabled(uuid)') is null
    or to_regclass('app.fantasy_player_point_events') is null then
    raise exception 'ops_health_two_stage: prerequisite missing (20261011150000, 20260927140000)';
  end if;

  -- 1. Coverage: the whole check, from its comment to the scoring comment.
  new_coverage := $cov$
  -- Fantasy: player statistics for every finished match that counts for
  -- points, in the two stages SofaScore publishes them (20261013140000).
  -- CORE data (a ready observation: minutes, goals, cards; for a gameweek that
  -- is not adaptive, a coverage row certified scoring_statistics_complete and
  -- reconciled) is what scoring needs. FULL statistics come days later and are
  -- never required for points. The final whistle is finalized_at, or kickoff
  -- + 2 h for a finished row without one. A match with no core data warns 6 h
  -- after it and fails 12 h after it; a match with core data waiting for full
  -- statistics is information only until 21 days after its kickoff, then
  -- fails (final limited). Settled gameweeks are out of scope. The windows are
  -- app_private.fantasy_core_data_warn_window, fantasy_core_data_window and
  -- fantasy_full_stats_window.
  select
    count(*) filter (where m.core) as covered,
    count(*) filter (where not m.core and m.final_at >= now_at - app_private.fantasy_core_data_warn_window()) as waiting,
    count(*) filter (where not m.core and m.final_at < now_at - app_private.fantasy_core_data_warn_window()) as late,
    count(*) filter (where not m.core and m.final_at < now_at - app_private.fantasy_core_data_window()) as overdue,
    count(*) filter (where not m.core and m.partial and m.final_at < now_at - app_private.fantasy_core_data_warn_window()) as partial,
    min(m.final_at) filter (where not m.core) as oldest_final,
    (array_agg(m.gameweek order by m.final_at, m.gameweek) filter (where not m.core))[1]
      as oldest_gameweek,
    count(*) filter (where m.core and not m.full_stats) as awaiting_full,
    count(*) filter (where m.core and not m.full_stats
      and m.kickoff_at < now_at - app_private.fantasy_full_stats_window()) as final_limited,
    min(m.kickoff_at) filter (where m.core and not m.full_stats
      and m.kickoff_at < now_at - app_private.fantasy_full_stats_window()) as oldest_limited_kickoff,
    (array_agg(m.gameweek order by m.kickoff_at, m.gameweek) filter (where m.core and not m.full_stats
      and m.kickoff_at < now_at - app_private.fantasy_full_stats_window()))[1] as oldest_limited_gameweek
  into coverage
  from (
    select coalesce(f.finalized_at, f.kickoff_at + interval '2 hours') as final_at,
      f.kickoff_at,
      case when watched_seasons > 1 then s.name || ' ' else '' end || 'GW' || g.sequence_number as gameweek,
      app_private.fantasy_fixture_health_ready(g.id,f.id,c.scoring_statistics_complete and c.reconciled) as core,
      app_private.fantasy_fixture_full_stats(g.id,f.id,c.scoring_statistics_complete and c.reconciled) as full_stats,
      c.fixture_id is not null as partial
    from app.fantasy_fixture_assignments a
    join app.fantasy_seasons s on s.id = a.fantasy_season_id and s.status in ('registration_open', 'active')
    join app.fantasy_gameweeks g on g.id = a.gameweek_id
      and g.status not in ('finalized', 'corrected', 'cancelled')
    join app.fixtures f on f.id = a.fixture_id and f.status = 'finished'
    left join app_private.historical_performance_fixture_coverage c on c.fixture_id = f.id
    where a.superseded_at is null and a.counts_points
  ) m;
  checks := checks || jsonb_build_object('name', 'fantasy_fixture_coverage', 'status',
    case when coverage.overdue > 0 or coverage.final_limited > 0 then 'fail'
      when coverage.late > 0 then 'warn' else 'ok' end,
    'detail',
    case
      when coverage.late > 0 then
        case when coverage.overdue > 0
          then coverage.overdue || ' counted match(es) final '
            || floor(extract(epoch from app_private.fantasy_core_data_window()) / 3600) || '+ h ago'
          else coverage.late || ' counted match(es) final '
            || floor(extract(epoch from app_private.fantasy_core_data_warn_window()) / 3600) || '+ h ago' end
        || ' without complete player statistics (oldest: ' || coverage.oldest_gameweek || ', final '
        || floor(extract(epoch from now_at - coverage.oldest_final) / 3600) || ' h ago'
        || case when coverage.partial > 0 then '; ' || coverage.partial || ' with partial statistics' else '' end
        || ')' || case when coverage.overdue > 0 then ': their Fantasy points cannot be computed' else '' end
      when coverage.final_limited > 0 then
        coverage.final_limited || ' counted match(es) with core statistics only, still without full player statistics '
        || floor(extract(epoch from app_private.fantasy_full_stats_window()) / 86400)
        || '+ days after kickoff (oldest: ' || coverage.oldest_limited_gameweek || ', kicked off '
        || floor(extract(epoch from now_at - coverage.oldest_limited_kickoff) / 86400) || ' days ago): final limited'
      when coverage.covered + coverage.waiting = 0 then 'no finished match counts for Fantasy points yet'
      else coverage.covered || ' of ' || (coverage.covered + coverage.waiting)
        || ' finished counted match(es) with '
        || case when coverage.awaiting_full > 0 then 'core' else 'complete' end || ' player statistics'
        || case when coverage.waiting > 0 then ' (the others final under 6 h ago)' else '' end
    end
    || case when coverage.late > 0 and coverage.final_limited > 0
      then '; ' || coverage.final_limited || ' more counted match(es) final limited (full player statistics still missing '
        || floor(extract(epoch from app_private.fantasy_full_stats_window()) / 86400) || '+ days after kickoff)'
      else '' end
    || case when coverage.awaiting_full > coverage.final_limited
      then '; info: ' || (coverage.awaiting_full - coverage.final_limited)
        || ' match(es) with core statistics waiting for full statistics (normal for up to '
        || floor(extract(epoch from app_private.fantasy_full_stats_window()) / 86400)
        || ' days after kickoff, not a fault)'
      else '' end);

$cov$;
  start_at := strpos(definition, '  -- Fantasy: player statistics for every finished match that counts for');
  end_at := strpos(definition, '  -- Fantasy: points for every gameweek past its lock (20260926003400).');
  if start_at = 0 or end_at = 0 or end_at <= start_at then
    raise exception 'ops_health_two_stage: coverage anchors not found';
  end if;
  definition := left(definition, start_at - 1) || substr(new_coverage, 2) || substr(definition, end_at);

  -- 2. Scoring: the comment's last sentences say how it now works.
  new_comment := $cmt$Once every counted match is final: core points (20261013140000)
  -- are what a gameweek owes, and provisional points count as points. Warn
  -- when a counted match has no points app.fantasy_player_point_events holds
  -- for it core_data_window + scoring_run_grace after its final whistle (the
  -- worker selects the scoring mode at the window, in its hourly run), the
  -- same while other matches are still to play where live scoring publishes a
  -- fixture's points as soon as it is ready. Never warn, and never fail,
  -- because points are provisional rather than final: that is the normal
  -- state of a gameweek until its full statistics arrive and it finalizes.
  -- A match with no core data at all is fantasy_fixture_coverage's failure;
  -- this check warns about its missing points as well.
$cmt$;
  start_at := strpos(definition, 'Once every counted match is final: while statistics are');
  end_at := strpos(definition, E'  select w.*,\n    count(*) filter (where w.verdict in (''stalled'', ''fail'')) over ()');
  if start_at = 0 or end_at = 0 or end_at <= start_at then
    raise exception 'ops_health_two_stage: scoring comment anchors not found';
  end if;
  definition := left(definition, start_at - 1) || new_comment || substr(definition, end_at);

  -- 3. Per counted match: do its points exist, is live scoring on.
  patched := replace(definition,
    'f.id as fixture_id, app_private.fantasy_adaptive_enabled(g.id) as adaptive, f.status::text as fixture_status,',
    'f.id as fixture_id, app_private.fantasy_adaptive_enabled(g.id) as adaptive, '
    || 'exists (select 1 from app.fantasy_player_point_events e where e.gameweek_id = g.id and e.fixture_id = f.id '
    || 'and e.source_key like ''fixture-stats:%'' and e.superseded_at is null) as has_points, '
    || 'app_private.fantasy_live_scoring_enabled(g.id) as live_scoring, f.status::text as fixture_status,');
  if patched = definition then
    raise exception 'ops_health_two_stage: fixture list fragment not found';
  end if;
  definition := patched;

  -- 4. Per gameweek: how many finished matches lack points, and since when.
  patched := replace(definition,
    'count(*) filter (where not m.complete) as without_statistics,',
    'count(*) filter (where not m.complete) as without_statistics, '
    || 'count(*) filter (where m.hold is null and not m.has_points) as points_missing, '
    || 'count(*) filter (where m.hold is null and not m.has_points and m.final_at < now_at - '
    || '(app_private.fantasy_core_data_window() + app_private.fantasy_scoring_run_grace())) as points_overdue, '
    || 'min(m.final_at) filter (where m.hold is null and not m.has_points) as points_oldest_final, '
    || 'bool_or(m.live_scoring) as live_scoring,');
  if patched = definition then
    raise exception 'ops_health_two_stage: without_statistics fragment not found';
  end if;
  definition := patched;

  -- 5. The verdict once matches are final: missing core points, nothing else.
  old_verdict := $old$        when v.finished < v.matches then 'in_play'
        when v.without_statistics > 0 then
          case when v.last_final >= now_at - interval '6 hours' then 'due' else 'warn' end
        when v.statistics_since >= now_at - interval '1 hour' then 'due'
        when v.statistics_since >= now_at - interval '8 hours' then 'unscored'
        else 'fail' end as verdict$old$;
  new_verdict := $new$        when v.points_overdue > 0 and (v.live_scoring or v.finished = v.matches) then 'warn'
        when v.finished < v.matches then 'in_play'
        when v.points_missing > 0 then 'due'
        else 'scored' end as verdict$new$;
  patched := replace(definition, old_verdict, new_verdict);
  if patched = definition then
    raise exception 'ops_health_two_stage: verdict fragment not found';
  end if;
  definition := patched;

  -- 6. Its wording.
  new_detail := $det$      else case scoring.verdict
        when 'warn' then scoring.gameweek || ': core points missing for ' || scoring.points_overdue
          || ' counted match(es) ' || floor(extract(epoch from app_private.fantasy_core_data_window()) / 3600)
          || '+ h after full time (oldest final '
          || floor(extract(epoch from now_at - scoring.points_oldest_final) / 3600) || ' h ago): '
          || scoring_stage
          || case when scoring.without_statistics > 0
            then '; ' || scoring.without_statistics
              || ' match(es) without core player statistics (fantasy_fixture_coverage)' else '' end
        when 'due' then scoring.gameweek || ': every counted match final, core points due by '
          || to_char((scoring.points_oldest_final + app_private.fantasy_core_data_window()
            + app_private.fantasy_scoring_run_grace()) at time zone 'UTC', 'HH24:MI') || ' UTC'
        when 'scored' then scoring.gameweek || ' ' || scoring.status || ': core points present for all '
          || scoring.matches || ' counted match(es); provisional points count as points'
        when 'in_play' then scoring.gameweek || ' ' || scoring.status || ': ' || scoring.finished
          || ' of ' || scoring.matches || ' counted matches final; points come after the last one'
$det$;
  start_at := strpos(definition, E'      else case scoring.verdict\n        when ''fail'' then');
  end_at := strpos(definition, E'        else ''no gameweek in play or waiting for points'' end');
  if start_at = 0 or end_at = 0 or end_at <= start_at then
    raise exception 'ops_health_two_stage: scoring detail anchors not found';
  end if;
  definition := left(definition, start_at - 1) || new_detail || substr(definition, end_at);

  execute definition;
end
$two_stage_alerts$;
