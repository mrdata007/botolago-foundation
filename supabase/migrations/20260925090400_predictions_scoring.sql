-- BotolaGO Production V2
-- Pronostics (score predictions), part 5 of 6: scoring.
--
-- A pg_cron job, predictions-score-tick, runs app_private.predictions_score_tick()
-- every 5 minutes inside the database (no Edge Function, no secret):
--
--   1. While the switch is off (mode = off) or scoring is paused, it returns at
--      once and writes nothing.
--   2. It takes a non-blocking lock, so two overlapping runs cannot both work.
--   3. It picks at most 4 matches whose current facts differ from what was last
--      scored (app_private.prediction_fixture_scoring): newly final, voided,
--      corrected score, changed teams, kick-off or journée, operator override.
--      A match is final when status = finished AND finalized_at is set; the
--      provider stores scores for matches that were never played (a postponed
--      match and a not-yet-started one both carried 0-0 in production on
--      24 Sept 2026), so nothing else is ever scored.
--   4. For each: one update sets points / result_kind on all its predictions.
--      Goals are mapped by team (a home/away swap scores the player's intent; a
--      different match is void). A prediction submitted at or after the match's
--      final kick-off scores nothing (result_kind = late): it covers a kick-off
--      moved earlier that the database learned about late.
--   5. The journée and season rows of every player concerned are rebuilt from
--      their predictions (never incremented), then every affected journée and
--      season is re-ranked (points, then exact scores, then a shared rank;
--      banned and deleted accounts are unranked). Only rows that change are
--      written.
--   6. One app_private.prediction_job_runs row when anything happened; a failed
--      run is rolled back and logged, and the next run retries.
--
-- Running it again with nothing new changes nothing. It never writes
-- app.fixtures, and no trigger is added to app.fixtures: ingestion and Fantasy
-- are unaffected if this job fails.
--
-- Operator functions (postgres only, SQL editor), each logged with its reason:
--   app_private.predictions_configure(mode, scoring_enabled, tester_user_ids, competition_id)
--   app_private.predictions_void_fixture(fixture_id, reason)
--   app_private.predictions_unvoid_fixture(fixture_id, reason)
--   app_private.predictions_rescore_fixture(fixture_id, reason)
--   app_private.predictions_status()
--
-- Pause everything: select app_private.predictions_configure('off');
--
-- Plan: docs/backend/PREDICTIONS_DOMAIN_PLAN.md (BG-0146).

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- The scoring pass
-- ---------------------------------------------------------------------------
create or replace function app_private.predictions_score_pending(
  p_now timestamptz default statement_timestamp(),
  p_limit integer default 4
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings app_private.prediction_settings%rowtype;
  run_started timestamptz := clock_timestamp();
  batch_size integer := least(greatest(coalesce(p_limit, 4), 1), 50);
  work record;
  rule smallint;
  processed integer := 0;
  predictions_updated integer := 0;
  standings_updated integer := 0;
  n integer;
  fixture_ids uuid[] := '{}'::uuid[];
  affected_users uuid[] := '{}'::uuid[];
  affected_rounds uuid[] := '{}'::uuid[];
  affected_seasons uuid[] := '{}'::uuid[];
begin
  select * into settings from app_private.prediction_settings where id;
  if settings.mode = 'off' or not settings.scoring_enabled then
    return jsonb_build_object('outcome', 'disabled');
  end if;
  if not pg_try_advisory_xact_lock(pg_catalog.hashtextextended('botolago:predictions-score', 0)) then
    return jsonb_build_object('outcome', 'busy');
  end if;

  for work in
    with candidate as (
      select fixture.id as fixture_id, fixture.season_id, fixture.round_id,
        fixture.status::text as status, fixture.kickoff_at,
        fixture.home_team_id, fixture.away_team_id, fixture.home_score, fixture.away_score,
        scoring.fixture_id is not null as has_record,
        scoring.state as record_state, scoring.result_home as record_home,
        scoring.result_away as record_away, scoring.fixture_kickoff_at as record_kickoff,
        scoring.home_team_id as record_home_team, scoring.away_team_id as record_away_team,
        scoring.round_id as record_round_id, scoring.season_id as record_season_id,
        scoring.rule_version as record_rule,
        case
          when scoring.override = 'void' then 'void'
          when fixture.status in ('cancelled', 'abandoned') then 'void'
          when fixture.status = 'finished' and fixture.finalized_at is not null
            and fixture.home_score is not null and fixture.away_score is not null then 'scored'
          else 'unscored'
        end as desired_state
      from app.fixtures fixture
      left join app_private.prediction_fixture_scoring scoring on scoring.fixture_id = fixture.id
      where scoring.fixture_id is not null
        or exists (select 1 from app.predictions prediction where prediction.fixture_id = fixture.id)
    ),
    desired as (
      select candidate.*,
        case when desired_state = 'scored' then home_score end as desired_home,
        case when desired_state = 'scored' then away_score end as desired_away
      from candidate
    )
    select desired.*
    from desired
    where (not has_record and desired_state <> 'unscored')
      or (has_record and (
        record_state is distinct from desired_state
        or record_home is distinct from desired_home
        or record_away is distinct from desired_away
        or record_kickoff is distinct from kickoff_at
        or record_home_team is distinct from home_team_id
        or record_away_team is distinct from away_team_id
        or record_round_id is distinct from round_id
        or record_season_id is distinct from season_id
      ))
    order by kickoff_at, fixture_id
    limit batch_size
  loop
    -- A match keeps the rule it was first scored with; an operator re-score
    -- (predictions_rescore_fixture) applies the current one.
    rule := coalesce(work.record_rule, settings.rule_version);

    update app.predictions prediction set
      points = scored.points,
      result_kind = scored.result_kind,
      rule_version = scored.rule_version,
      scored_at = scored.scored_at
    from (
      select mapped.id,
        case
          when work.desired_state = 'unscored' then null
          when work.desired_state = 'void' or mapped.late or mapped.home is null then 0
          else app_private.prediction_points(mapped.home, mapped.away, work.desired_home, work.desired_away)
        end as points,
        case
          when work.desired_state = 'unscored' then null
          when work.desired_state = 'void' or mapped.home is null then 'void'
          when mapped.late then 'late'
          else app_private.prediction_result_kind(mapped.home, mapped.away, work.desired_home, work.desired_away)
        end as result_kind,
        case when work.desired_state = 'unscored' then null else rule end as rule_version,
        case when work.desired_state = 'unscored' then null else p_now end as scored_at
      from (
        select existing.id,
          existing.submitted_at >= work.kickoff_at as late,
          case
            when (existing.home_team_id, existing.away_team_id) = (work.home_team_id, work.away_team_id)
              then existing.home_goals::integer
            when (existing.home_team_id, existing.away_team_id) = (work.away_team_id, work.home_team_id)
              then existing.away_goals::integer
          end as home,
          case
            when (existing.home_team_id, existing.away_team_id) = (work.home_team_id, work.away_team_id)
              then existing.away_goals::integer
            when (existing.home_team_id, existing.away_team_id) = (work.away_team_id, work.home_team_id)
              then existing.home_goals::integer
          end as away
        from app.predictions existing
        where existing.fixture_id = work.fixture_id
      ) mapped
    ) scored
    where prediction.id = scored.id
      and (prediction.points, prediction.result_kind, prediction.rule_version)
        is distinct from (scored.points::smallint, scored.result_kind, scored.rule_version);
    get diagnostics n = row_count;
    predictions_updated := predictions_updated + n;

    insert into app_private.prediction_fixture_scoring as scoring (
      fixture_id, season_id, round_id, state, result_home, result_away, fixture_status,
      fixture_kickoff_at, home_team_id, away_team_id, rule_version, revision,
      predictions_scored, scored_at
    ) values (
      work.fixture_id, work.season_id, work.round_id, work.desired_state,
      work.desired_home, work.desired_away, work.status, work.kickoff_at,
      work.home_team_id, work.away_team_id, rule, 1,
      (select count(*) from app.predictions counted where counted.fixture_id = work.fixture_id),
      p_now
    )
    on conflict (fixture_id) do update set
      season_id = excluded.season_id,
      round_id = excluded.round_id,
      state = excluded.state,
      result_home = excluded.result_home,
      result_away = excluded.result_away,
      fixture_status = excluded.fixture_status,
      fixture_kickoff_at = excluded.fixture_kickoff_at,
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      rule_version = excluded.rule_version,
      revision = scoring.revision + 1,
      predictions_scored = excluded.predictions_scored,
      scored_at = excluded.scored_at,
      corrected_at = case
        when scoring.state = 'scored' and excluded.state = 'scored'
          and (scoring.result_home, scoring.result_away)
            is distinct from (excluded.result_home, excluded.result_away)
        then excluded.scored_at
        else scoring.corrected_at
      end;

    fixture_ids := fixture_ids || work.fixture_id;
    affected_users := affected_users || array(
      select counted.user_id from app.predictions counted where counted.fixture_id = work.fixture_id
    );
    affected_rounds := affected_rounds || array_remove(array[work.round_id, work.record_round_id], null);
    affected_seasons := affected_seasons || array_remove(array[work.season_id, work.record_season_id], null);
    processed := processed + 1;
  end loop;

  if processed = 0 then
    return jsonb_build_object('outcome', 'idle');
  end if;

  affected_users := array(select distinct unnest(affected_users));
  affected_rounds := array(select distinct unnest(affected_rounds));
  affected_seasons := array(select distinct unnest(affected_seasons));

  -- Journée rows of the players concerned, rebuilt from their predictions.
  with totals as (
    select fixture.season_id, fixture.round_id, prediction.user_id,
      coalesce(sum(prediction.points), 0)::integer as points,
      count(*) filter (where prediction.result_kind = 'exact')::integer as exact_count,
      count(*) filter (where prediction.result_kind = 'outcome')::integer as outcome_count,
      count(*) filter (where prediction.result_kind = 'miss')::integer as miss_count,
      count(*) filter (where prediction.result_kind in ('void', 'late'))::integer as void_count,
      count(*)::integer as predicted_count
    from app.predictions prediction
    join app.fixtures fixture on fixture.id = prediction.fixture_id
    where prediction.user_id = any(affected_users)
      and fixture.round_id = any(affected_rounds)
    group by fixture.season_id, fixture.round_id, prediction.user_id
  )
  insert into app.prediction_standings as standing (
    season_id, round_id, user_id, points, exact_count, outcome_count, miss_count,
    void_count, scored_count, predicted_count
  )
  select totals.season_id, totals.round_id, totals.user_id, totals.points, totals.exact_count,
    totals.outcome_count, totals.miss_count, totals.void_count,
    totals.exact_count + totals.outcome_count + totals.miss_count, totals.predicted_count
  from totals
  on conflict (season_id, round_id, user_id) do update set
    points = excluded.points,
    exact_count = excluded.exact_count,
    outcome_count = excluded.outcome_count,
    miss_count = excluded.miss_count,
    void_count = excluded.void_count,
    scored_count = excluded.scored_count,
    predicted_count = excluded.predicted_count
  where (standing.points, standing.exact_count, standing.outcome_count, standing.miss_count,
      standing.void_count, standing.scored_count, standing.predicted_count)
    is distinct from (excluded.points, excluded.exact_count, excluded.outcome_count,
      excluded.miss_count, excluded.void_count, excluded.scored_count, excluded.predicted_count);
  get diagnostics n = row_count;
  standings_updated := standings_updated + n;

  -- A journée row left without predictions (its match moved to another
  -- journée) is removed.
  delete from app.prediction_standings standing
  where standing.round_id = any(affected_rounds)
    and standing.user_id = any(affected_users)
    and not exists (
      select 1 from app.predictions prediction
      join app.fixtures fixture on fixture.id = prediction.fixture_id
      where prediction.user_id = standing.user_id and fixture.round_id = standing.round_id
    );
  get diagnostics n = row_count;
  standings_updated := standings_updated + n;

  -- Season rows of the players concerned, rebuilt from their journée rows.
  with totals as (
    select standing.season_id, standing.user_id,
      sum(standing.points)::integer as points,
      sum(standing.exact_count)::integer as exact_count,
      sum(standing.outcome_count)::integer as outcome_count,
      sum(standing.miss_count)::integer as miss_count,
      sum(standing.void_count)::integer as void_count,
      sum(standing.scored_count)::integer as scored_count,
      sum(standing.predicted_count)::integer as predicted_count,
      (count(*) filter (where standing.scored_count > 0))::integer as rounds_played
    from app.prediction_standings standing
    where standing.round_id is not null
      and standing.user_id = any(affected_users)
      and standing.season_id = any(affected_seasons)
    group by standing.season_id, standing.user_id
  )
  insert into app.prediction_standings as standing (
    season_id, round_id, user_id, points, exact_count, outcome_count, miss_count,
    void_count, scored_count, predicted_count, rounds_played
  )
  select totals.season_id, null, totals.user_id, totals.points, totals.exact_count,
    totals.outcome_count, totals.miss_count, totals.void_count, totals.scored_count,
    totals.predicted_count, totals.rounds_played
  from totals
  on conflict (season_id, round_id, user_id) do update set
    points = excluded.points,
    exact_count = excluded.exact_count,
    outcome_count = excluded.outcome_count,
    miss_count = excluded.miss_count,
    void_count = excluded.void_count,
    scored_count = excluded.scored_count,
    predicted_count = excluded.predicted_count,
    rounds_played = excluded.rounds_played
  where (standing.points, standing.exact_count, standing.outcome_count, standing.miss_count,
      standing.void_count, standing.scored_count, standing.predicted_count, standing.rounds_played)
    is distinct from (excluded.points, excluded.exact_count, excluded.outcome_count,
      excluded.miss_count, excluded.void_count, excluded.scored_count, excluded.predicted_count,
      excluded.rounds_played);
  get diagnostics n = row_count;
  standings_updated := standings_updated + n;

  delete from app.prediction_standings standing
  where standing.round_id is null
    and standing.season_id = any(affected_seasons)
    and standing.user_id = any(affected_users)
    and not exists (
      select 1 from app.prediction_standings journee
      where journee.user_id = standing.user_id and journee.season_id = standing.season_id
        and journee.round_id is not null
    );
  get diagnostics n = row_count;
  standings_updated := standings_updated + n;

  -- Re-rank every affected journée and season. Ranked: at least one scored
  -- prediction, a live profile, no active ban.
  with eligible as (
    select standing.id,
      rank() over (
        partition by standing.season_id, standing.round_id
        order by standing.points desc, standing.exact_count desc
      ) as position
    from app.prediction_standings standing
    join app.profiles profile on profile.id = standing.user_id and profile.deleted_at is null
    where standing.scored_count > 0
      and (standing.round_id = any(affected_rounds)
        or (standing.round_id is null and standing.season_id = any(affected_seasons)))
      and not exists (
        select 1 from app_private.user_bans ban
        where ban.user_id = standing.user_id and ban.lifted_at is null
          and ban.starts_at <= p_now and (ban.ends_at is null or ban.ends_at > p_now)
      )
  ),
  target as (
    select standing.id, eligible.position
    from app.prediction_standings standing
    left join eligible on eligible.id = standing.id
    where standing.round_id = any(affected_rounds)
      or (standing.round_id is null and standing.season_id = any(affected_seasons))
  )
  update app.prediction_standings standing
  set rank = target.position
  from target
  where standing.id = target.id and standing.rank is distinct from target.position;
  get diagnostics n = row_count;
  standings_updated := standings_updated + n;

  insert into app_private.prediction_job_runs (
    kind, started_at, finished_at, outcome, fixtures_processed, predictions_updated,
    standings_updated, detail
  ) values (
    'tick', run_started, clock_timestamp(), 'succeeded', processed, predictions_updated,
    standings_updated, jsonb_build_object('fixtureIds', to_jsonb(fixture_ids))
  );

  return jsonb_build_object(
    'outcome', 'succeeded',
    'fixtures', processed,
    'predictionsUpdated', predictions_updated,
    'standingsUpdated', standings_updated,
    'fixtureIds', to_jsonb(fixture_ids)
  );
end;
$$;

comment on function app_private.predictions_score_pending(timestamptz, integer) is
  'Scores (or re-scores, voids, un-scores) at most p_limit matches whose facts differ from app_private.prediction_fixture_scoring, rebuilds the concerned players'' standings and re-ranks. Idempotent. Does nothing while mode = off or scoring is paused.';

create or replace function app_private.predictions_score_tick()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  run_started timestamptz := clock_timestamp();
  result jsonb;
begin
  begin
    result := app_private.predictions_score_pending(statement_timestamp(), 4);
  exception when others then
    insert into app_private.prediction_job_runs (kind, started_at, finished_at, outcome, error)
    values ('tick', run_started, clock_timestamp(), 'failed',
      left(format('%s: %s', sqlstate, sqlerrm), 600));
    return jsonb_build_object('outcome', 'failed');
  end;
  return result;
end;
$$;

comment on function app_private.predictions_score_tick() is
  'Run every 5 minutes by the pg_cron job predictions-score-tick. A failed pass is rolled back and logged in app_private.prediction_job_runs; the next run retries.';

-- ---------------------------------------------------------------------------
-- Operator functions (postgres only)
-- ---------------------------------------------------------------------------
create or replace function app_private.predictions_configure(
  p_mode text,
  p_scoring_enabled boolean default null,
  p_tester_user_ids uuid[] default null,
  p_competition_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare result app_private.prediction_settings%rowtype;
begin
  if p_mode is null or p_mode not in ('off', 'testers', 'public') then
    raise exception using errcode = '22023', message = 'predictions_mode_invalid';
  end if;
  update app_private.prediction_settings set
    mode = p_mode,
    scoring_enabled = coalesce(p_scoring_enabled, scoring_enabled),
    tester_user_ids = coalesce(p_tester_user_ids, tester_user_ids),
    competition_id = coalesce(p_competition_id, competition_id)
  where id
  returning * into result;
  insert into app_private.prediction_job_runs (kind, started_at, finished_at, outcome, detail)
  values ('operator', clock_timestamp(), clock_timestamp(), 'applied', jsonb_build_object(
    'action', 'configure', 'mode', result.mode, 'scoringEnabled', result.scoring_enabled,
    'testers', cardinality(result.tester_user_ids), 'competitionId', result.competition_id));
  return jsonb_build_object('mode', result.mode, 'scoringEnabled', result.scoring_enabled,
    'testers', cardinality(result.tester_user_ids), 'competitionId', result.competition_id,
    'ruleVersion', result.rule_version);
end;
$$;

create or replace function app_private.predictions_assert_reason(p_reason text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 8 and 500 then
    raise exception using errcode = '22023', message = 'predictions_reason_invalid';
  end if;
  return btrim(p_reason);
end;
$$;

-- Void a match for Pronostics (a walkover, an awarded result, a match that
-- will never be played). Takes effect on the next scoring run.
create or replace function app_private.predictions_void_fixture(p_fixture_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reason text := app_private.predictions_assert_reason(p_reason);
  target app.fixtures%rowtype;
  settings app_private.prediction_settings%rowtype;
begin
  select * into target from app.fixtures where id = p_fixture_id;
  if target.id is null then
    raise exception using errcode = 'P0002', message = 'predictions_fixture_not_found';
  end if;
  select * into settings from app_private.prediction_settings where id;
  insert into app_private.prediction_fixture_scoring as scoring (
    fixture_id, season_id, round_id, state, fixture_status, fixture_kickoff_at,
    home_team_id, away_team_id, rule_version, predictions_scored,
    override, override_reason, override_at
  ) values (
    target.id, target.season_id, target.round_id, 'unscored', target.status::text,
    target.kickoff_at, target.home_team_id, target.away_team_id, settings.rule_version, 0,
    'void', reason, statement_timestamp()
  )
  on conflict (fixture_id) do update set
    override = 'void', override_reason = excluded.override_reason, override_at = excluded.override_at;
  insert into app_private.prediction_job_runs (kind, started_at, finished_at, outcome, detail, reason)
  values ('operator', clock_timestamp(), clock_timestamp(), 'applied',
    jsonb_build_object('action', 'void_fixture', 'fixtureId', target.id), reason);
  return jsonb_build_object('fixtureId', target.id, 'override', 'void');
end;
$$;

create or replace function app_private.predictions_unvoid_fixture(p_fixture_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare reason text := app_private.predictions_assert_reason(p_reason);
begin
  update app_private.prediction_fixture_scoring
  set override = null, override_reason = null, override_at = null
  where fixture_id = p_fixture_id and override is not null;
  if not found then
    raise exception using errcode = 'P0002', message = 'predictions_override_not_found';
  end if;
  insert into app_private.prediction_job_runs (kind, started_at, finished_at, outcome, detail, reason)
  values ('operator', clock_timestamp(), clock_timestamp(), 'applied',
    jsonb_build_object('action', 'unvoid_fixture', 'fixtureId', p_fixture_id), reason);
  return jsonb_build_object('fixtureId', p_fixture_id, 'override', null);
end;
$$;

-- Force a match to be scored again on the next run, with the current rule.
create or replace function app_private.predictions_rescore_fixture(p_fixture_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reason text := app_private.predictions_assert_reason(p_reason);
  settings app_private.prediction_settings%rowtype;
begin
  select * into settings from app_private.prediction_settings where id;
  update app_private.prediction_fixture_scoring set
    state = 'unscored', result_home = null, result_away = null,
    rule_version = settings.rule_version
  where fixture_id = p_fixture_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'predictions_fixture_not_scored';
  end if;
  insert into app_private.prediction_job_runs (kind, started_at, finished_at, outcome, detail, reason)
  values ('operator', clock_timestamp(), clock_timestamp(), 'applied',
    jsonb_build_object('action', 'rescore_fixture', 'fixtureId', p_fixture_id), reason);
  return jsonb_build_object('fixtureId', p_fixture_id, 'queued', true);
end;
$$;

-- One read for the owner: the switch, the job, each journée of the current
-- season, matches waiting too long for a final result, recent runs.
create or replace function app_private.predictions_status(p_now timestamptz default statement_timestamp())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  settings app_private.prediction_settings%rowtype;
  v_season_id uuid := app_private.predictions_current_season();
begin
  select * into settings from app_private.prediction_settings where id;
  return jsonb_build_object(
    'mode', settings.mode,
    'scoringEnabled', settings.scoring_enabled,
    'testers', cardinality(settings.tester_user_ids),
    'ruleVersion', settings.rule_version,
    'jobActive', exists (select 1 from cron.job where jobname = 'predictions-score-tick' and active),
    'seasonId', v_season_id,
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'round', round_row.round_number,
        'state', app_private.prediction_round_state(round_row.id, p_now),
        'fixtures', (select count(*) from app.fixtures fixture where fixture.round_id = round_row.id),
        'scored', (select count(*) from app_private.prediction_fixture_scoring scoring
          where scoring.round_id = round_row.id and scoring.state = 'scored'),
        'void', (select count(*) from app_private.prediction_fixture_scoring scoring
          where scoring.round_id = round_row.id and scoring.state = 'void'),
        'players', (select count(distinct prediction.user_id) from app.predictions prediction
          join app.fixtures fixture on fixture.id = prediction.fixture_id
          where fixture.round_id = round_row.id),
        'predictions', (select count(*) from app.predictions prediction
          join app.fixtures fixture on fixture.id = prediction.fixture_id
          where fixture.round_id = round_row.id)
      ) order by round_row.round_number)
      from app.rounds round_row
      where round_row.season_id = v_season_id
        and exists (select 1 from app.fixtures fixture where fixture.round_id = round_row.id)
    ), '[]'::jsonb),
    'waitingForFinal', coalesce((
      select jsonb_agg(jsonb_build_object('fixtureId', fixture.id, 'kickoffAt', fixture.kickoff_at,
        'status', fixture.status) order by fixture.kickoff_at)
      from app.fixtures fixture
      where fixture.status = 'finished' and fixture.finalized_at is null
        and fixture.kickoff_at < p_now - interval '6 hours'
        and exists (select 1 from app.predictions prediction where prediction.fixture_id = fixture.id)
    ), '[]'::jsonb),
    'recentRuns', coalesce((
      select jsonb_agg(jsonb_build_object('kind', run.kind, 'startedAt', run.started_at,
        'outcome', run.outcome, 'fixtures', run.fixtures_processed, 'error', run.error,
        'reason', run.reason, 'detail', run.detail) order by run.started_at desc)
      from (select * from app_private.prediction_job_runs order by started_at desc limit 10) run
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function app_private.predictions_score_pending(timestamptz, integer)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_score_tick()
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_configure(text, boolean, uuid[], uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_assert_reason(text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_void_fixture(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_unvoid_fixture(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_rescore_fixture(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.predictions_status(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function app_private.predictions_score_tick() to postgres;

-- ---------------------------------------------------------------------------
-- The job. Idle (no writes) while mode = off.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'predictions-score-tick',
  '*/5 * * * *',
  'select app_private.predictions_score_tick();'
);

select cron.schedule(
  'predictions-history-prune',
  '53 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'predictions-score-tick')
      and end_time < now() - interval '7 days';
    delete from app_private.prediction_job_runs
    where started_at < now() - interval '90 days';
  $prune$
);
