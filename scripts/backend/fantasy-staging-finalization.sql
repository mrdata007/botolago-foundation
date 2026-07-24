-- BotolaGO Fantasy Phase 6 finalization/ranking capacity exercise.
-- STAGING ONLY. Requires the deterministic capacity seed and service context.
-- Execute with ON_ERROR_STOP and capture the final JSON result.

select set_config('botolago.capacity_environment', 'staging-v2', false);
do $$
begin
  if current_setting('botolago.capacity_environment', true) <> 'staging-v2' then
    raise exception 'fantasy_capacity_test_requires_staging_guard';
  end if;
  if (select count(*) from app.fantasy_teams
      where fantasy_season_id = 'fa630000-0000-4000-8000-000000000001') <> 50000 then
    raise exception 'fantasy_capacity_seed_profile_missing';
  end if;
end;
$$;

create temporary table fantasy_capacity_metrics (
  metric text primary key,
  started_at timestamptz,
  completed_at timestamptz,
  value jsonb
) on commit preserve rows;

insert into fantasy_capacity_metrics (metric, started_at)
values ('finalization', clock_timestamp());

update app.fantasy_gameweeks set status = 'provisional', points_state = 'provisional',
  finalized_at = null
where id = 'fa640000-0000-4000-8000-000000000002' and status = 'open';

begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare response jsonb;
declare cursor_id uuid;
declare processed integer := 0;
declare run_id uuid;
begin
  run_id := api.service_begin_fantasy_job(
    'finalize_gameweek',
    'fa630000-0000-4000-8000-000000000001',
    'fa640000-0000-4000-8000-000000000002', 2
  );
  for batch_number in 1..5 loop
    response := api.service_finalize_fantasy_team_results(
      'fa640000-0000-4000-8000-000000000002', 2, cursor_id, 2000
    );
    processed := processed + coalesce((response->>'finalized')::integer, 0);
    cursor_id := nullif(response->>'afterTeamId', '')::uuid;
  end loop;
  perform api.service_complete_fantasy_job(
    run_id, 'partial', processed, 0, 0,
    'injected_capacity_failure', 'Deliberate worker stop after five committed batches'
  );
end;
$$;
commit;

-- Resume in a new transaction, proving the committed partial run is safe.
begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare response jsonb;
declare cursor_id uuid;
declare run_id uuid;
declare processed integer := 0;
begin
  run_id := api.service_begin_fantasy_job(
    'finalize_gameweek',
    'fa630000-0000-4000-8000-000000000001',
    'fa640000-0000-4000-8000-000000000002', 2
  );
  loop
    response := api.service_finalize_fantasy_team_results(
      'fa640000-0000-4000-8000-000000000002', 2, cursor_id, 2000
    );
    processed := processed + coalesce((response->>'finalized')::integer, 0);
    cursor_id := nullif(response->>'afterTeamId', '')::uuid;
    exit when not coalesce((response->>'hasMore')::boolean, false);
  end loop;
  perform api.service_complete_fantasy_job(run_id, 'succeeded', processed, 0, 0);
end;
$$;

do $$
declare response jsonb;
begin
  loop
    response := api.service_restore_free_hit(
      'fa640000-0000-4000-8000-000000000002', 500
    );
    exit when not coalesce((response->>'hasMore')::boolean, false);
  end loop;
  loop
    response := api.service_roll_fantasy_free_transfers(
      'fa640000-0000-4000-8000-000000000002', 2000
    );
    exit when coalesce((response->>'updated')::integer, 0) = 0;
  end loop;
end;
$$;
commit;

update fantasy_capacity_metrics set completed_at = clock_timestamp(), value = jsonb_build_object(
  'finalResults', (select count(*) from app.fantasy_team_gameweek_results
    where gameweek_id = 'fa640000-0000-4000-8000-000000000002' and state = 'final'),
  'restoredFreeHits', (select count(*) from app.fantasy_free_hit_snapshots
    where gameweek_id = 'fa640000-0000-4000-8000-000000000002' and restored_at is not null),
  'rollovers', (select count(*) from app_private.fantasy_free_transfer_rollovers
    where gameweek_id = 'fa640000-0000-4000-8000-000000000002')
) where metric = 'finalization';

insert into fantasy_capacity_metrics (metric, started_at)
values ('overall_ranking', clock_timestamp());
begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api.service_recalculate_fantasy_rankings(
  'fa630000-0000-4000-8000-000000000001', null, null, 2
);
commit;
update fantasy_capacity_metrics set completed_at = clock_timestamp(), value = jsonb_build_object(
  'rows', (select count(*) from app.fantasy_rankings
    where fantasy_season_id = 'fa630000-0000-4000-8000-000000000001'
      and gameweek_id is null and league_id is null)
) where metric = 'overall_ranking';

insert into fantasy_capacity_metrics (metric, started_at)
values ('large_league_ranking', clock_timestamp());
begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api.service_recalculate_fantasy_rankings(
  'fa630000-0000-4000-8000-000000000001', null,
  'fa900000-0000-4000-8000-000000000001', 2
);
select api.service_complete_fantasy_gameweek(
  'fa640000-0000-4000-8000-000000000002', 2
);
commit;
update fantasy_capacity_metrics set completed_at = clock_timestamp(), value = jsonb_build_object(
  'rows', (select count(*) from app.fantasy_rankings
    where league_id = 'fa900000-0000-4000-8000-000000000001')
) where metric = 'large_league_ranking';

begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api.service_complete_fantasy_gameweek(
  'fa640000-0000-4000-8000-000000000002', 2
) as repeated_finalization;
commit;

select jsonb_build_object(
  'metrics', (select jsonb_object_agg(metric, jsonb_build_object(
    'durationMs', extract(epoch from completed_at - started_at) * 1000,
    'value', value
  )) from fantasy_capacity_metrics),
  'invariants', jsonb_build_object(
    'duplicateResults', (select count(*) from (
      select fantasy_team_id, gameweek_id from app.fantasy_team_gameweek_results
      group by fantasy_team_id, gameweek_id having count(*) > 1
    ) duplicates),
    'unrestoredFreeHits', (select count(*) from app.fantasy_free_hit_snapshots
      where gameweek_id = 'fa640000-0000-4000-8000-000000000002' and restored_at is null),
    'duplicateRollovers', (select count(*) from (
      select fantasy_team_id, gameweek_id from app_private.fantasy_free_transfer_rollovers
      group by fantasy_team_id, gameweek_id having count(*) > 1
    ) duplicates),
    'finalizedGameweek', (select status = 'finalized' from app.fantasy_gameweeks
      where id = 'fa640000-0000-4000-8000-000000000002')
  )
) as capacity_finalization_result;
