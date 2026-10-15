-- Ops health: `fantasy_progression` no longer fails because the previous
-- gameweek is provisional and waiting.
--
-- WHY. 20261009091728 made `fantasy_progression` warn within 24 h of a
-- scheduled gameweek's deadline and fail within 6 h, whatever kept it from
-- opening. SofaScore publishes Botola statistics in two stages (core data
-- at once, full statistics 5 to 16 days later; see 20261013140000), and the
-- owner's rule of 2026-10-12 is that a gameweek may close and the next one
-- open on provisional points: later re-pulls refine points without blocking
-- progression. So a scheduled gameweek whose predecessor is merely
-- provisional must not fail the check.
--
-- WHAT BLOCKS PROGRESSION IN THE CODE (not changed here; this lane only
-- alerts). api.service_prepare_next_fantasy_gameweek opens the successor only
-- once the predecessor is 'finalized' with its postwork complete
-- (20261009091728, fantasy_previous_postwork_incomplete), and the lifecycle
-- worker (scripts/backend/fantasy-lifecycle-runner.ts) finalizes only when
-- every counted match is adaptiveReady: its scoring mode is selected (final
-- whistle + 12 h) and its latest observation is ready in that mode. A match
-- with core data is ready in 'simple' mode from the cutoff, so full
-- statistics never block. A match with NO core data (no ready observation)
-- keeps the predecessor provisional for ever, and so the successor
-- scheduled. That, not "provisional", is what this check now reports.
--
-- THE RULE. For a scheduled gameweek the check looks at its predecessor:
--   * predecessor finalized: unchanged (warn within 24 h of the deadline,
--     fail within 6 h or when staged 15 min after complete postwork, a passed
--     deadline fails at once).
--   * predecessor not finalized, a counted match of it has no core data
--     (reason previous_core_data_missing): unchanged severity. That is a real
--     block, and fantasy_fixture_coverage fails for the match too.
--   * predecessor not finalized, every counted match final with core data,
--     and the last of them still inside core_data_window +
--     scoring_run_grace (13 h) of its whistle, deadline not passed: the
--     worker has not had its chance yet. Information only, never warn or
--     fail (reason previous_awaiting_core_selection, in the detail text).
--   * predecessor not finalized and past that point with core data present:
--     the lifecycle should have finalized it by now, so severity is
--     unchanged (the worker is not running, or something else holds it).
-- A passed deadline still fails in every case: the gameweek can no longer
-- open on its own.
--
-- Output shape: same check name and statuses; 'gameweeks' lists the blocked
-- ones as before (their entries gain previousStatus and
-- previousMatchesWithoutCoreData). Nothing else is touched: the wrappers,
-- app_private.ops_alert_tick() and the watchdog read the same keys.
--
-- HOW IT IS APPLIED. The check lives in
-- app_private.ops_health_checks_before_manager_card() (the 20261009091728
-- wrapper, renamed by 20261010120300). It is patched from pg_get_functiondef
-- like 20261011150000, and raises if an anchor is not found. Patching the
-- inner function by name keeps this independent of any wrapper added later.

do $two_stage_progression$
declare
  definition text := pg_get_functiondef('app_private.ops_health_checks_before_manager_card()'::regprocedure);
  patched text;
  start_at integer;
  end_at integer;
  new_block text;
begin
  if to_regprocedure('app_private.fantasy_core_data_window()') is null
    or to_regprocedure('app_private.fantasy_scoring_run_grace()') is null
    or to_regprocedure('app_private.fantasy_fixture_health_ready(uuid,uuid,boolean)') is null then
    raise exception 'ops_health_two_stage_progression: apply 20261013140000 first';
  end if;

  patched := replace(definition, E'  blocked jsonb;\n  failed boolean;\nbegin',
    E'  blocked jsonb;\n  failed boolean;\n  progression_info jsonb;\nbegin');
  if patched = definition then
    raise exception 'ops_health_two_stage_progression: declare fragment not found';
  end if;
  definition := patched;

  new_block := $blk$  with candidate as (
    select next_week.id, next_week.sequence_number, next_week.deadline_at, next_week.created_at,
      work.completed_at, previous.status::text as previous_status,
      gate.unfinished, gate.core_missing, gate.last_final
    from app.fantasy_gameweeks next_week
    join app.fantasy_seasons season on season.id = next_week.fantasy_season_id
    left join app.fantasy_gameweeks previous on previous.fantasy_season_id = next_week.fantasy_season_id
      and previous.sequence_number = next_week.sequence_number - 1
    left join app_private.fantasy_gameweek_postwork work on work.gameweek_id = previous.id
      and previous.status = 'finalized' and work.calculation_version = previous.scoring_input_version
    -- What keeps the predecessor from finalizing: counted matches not
    -- finished, finished ones with no core data, and when the last one ended.
    left join lateral (
      select count(*) filter (where f.status <> 'finished') as unfinished,
        count(*) filter (where f.status = 'finished'
          and not app_private.fantasy_fixture_health_ready(previous.id, f.id,
            coalesce(c.scoring_statistics_complete and c.reconciled, false))) as core_missing,
        max(coalesce(f.finalized_at, f.kickoff_at + interval '2 hours')) as last_final
      from app.fantasy_fixture_assignments a
      join app.fixtures f on f.id = a.fixture_id
      left join app_private.historical_performance_fixture_coverage c on c.fixture_id = f.id
      where a.gameweek_id = previous.id and a.superseded_at is null and a.counts_points
    ) gate on previous.id is not null
    where season.status in ('registration_open', 'active') and next_week.status = 'scheduled'
      and (next_week.deadline_at <= statement_timestamp() + interval '24 hours'
        or (work.completed_at is not null
          and greatest(work.completed_at, next_week.created_at) < statement_timestamp() - interval '15 minutes'))
  ), classified as (
    select candidate.*,
      -- Provisional and waiting, nothing missing, the worker not yet due.
      coalesce(candidate.previous_status in ('locked', 'live', 'provisional', 'finalizing')
        and candidate.unfinished = 0 and candidate.core_missing = 0
        and candidate.last_final + app_private.fantasy_core_data_window()
          + app_private.fantasy_scoring_run_grace() > statement_timestamp()
        and candidate.deadline_at > statement_timestamp(), false) as awaiting_selection
    from candidate
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'gameweekId', c.id, 'sequence', c.sequence_number,
      'deadlineAt', c.deadline_at,
      'reason', case when c.deadline_at <= statement_timestamp() then 'deadline_passed'
        when c.completed_at is not null then 'progression_pending'
        when c.previous_status is distinct from 'finalized' and c.core_missing > 0
          then 'previous_core_data_missing'
        else 'previous_postwork_incomplete' end,
      'previousStatus', c.previous_status,
      'previousMatchesWithoutCoreData', c.core_missing
    ) order by c.deadline_at) filter (where not c.awaiting_selection), '[]'::jsonb),
    coalesce(bool_or(c.deadline_at <= statement_timestamp() + interval '6 hours'
      or (c.completed_at is not null
        and greatest(c.completed_at, c.created_at) < statement_timestamp() - interval '15 minutes'))
      filter (where not c.awaiting_selection), false),
    coalesce(jsonb_agg(jsonb_build_object(
      'gameweekId', c.id, 'sequence', c.sequence_number,
      'deadlineAt', c.deadline_at,
      'reason', 'previous_awaiting_core_selection',
      'previousStatus', c.previous_status
    ) order by c.deadline_at) filter (where c.awaiting_selection), '[]'::jsonb)
  into blocked, failed, progression_info
  from classified c;
  checks := checks || jsonb_build_object('name', 'fantasy_progression',
    'status', case when failed then 'fail' when jsonb_array_length(blocked) > 0 then 'warn' else 'ok' end,
    'detail', case when jsonb_array_length(blocked) = 0 then 'no stalled or deadline-risk scheduled gameweek'
      else jsonb_array_length(blocked) || ' scheduled gameweek(s) need attention; see FANTASY_DURABLE_PROGRESSION_RUNBOOK.md'
        || case when exists (select 1 from jsonb_array_elements(blocked) b
            where b ->> 'previousStatus' is distinct from 'finalized'
              and coalesce((b ->> 'previousMatchesWithoutCoreData')::integer, 0) > 0)
          then '; the previous gameweek cannot finalize while a counted match has no core player data (minutes, goals, cards)'
          else '' end
      end
      || case when jsonb_array_length(progression_info) > 0
        then '; info: ' || jsonb_array_length(progression_info)
          || ' scheduled gameweek(s) wait for the previous one to finalize (every counted match has core data; provisional points count, full statistics do not block)'
        else '' end,
    'gameweeks', blocked);
$blk$;
  start_at := strpos(definition, E'  select coalesce(jsonb_agg(jsonb_build_object(\n    ''gameweekId'', next_week.id,');
  end_at := strpos(definition, E'  return result || jsonb_build_object(''checks'', checks, ''status'', case');
  if start_at = 0 or end_at = 0 or end_at <= start_at then
    raise exception 'ops_health_two_stage_progression: progression anchors not found';
  end if;
  definition := left(definition, start_at - 1) || new_block || substr(definition, end_at);

  execute definition;
end
$two_stage_progression$;
