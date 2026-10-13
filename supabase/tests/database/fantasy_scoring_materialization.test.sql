begin;

select extensions.no_plan();

select extensions.ok(
  (select bool_and(relrowsecurity and relforcerowsecurity)
   from pg_class where oid in (
     'app_private.fantasy_fixture_scoring_snapshots'::regclass,
     'app_private.fantasy_fixture_player_snapshots'::regclass
   )),
  'fixture scoring snapshot tables enable and force RLS'
);
select extensions.ok(
  not has_table_privilege(
    'service_role', 'app_private.fantasy_fixture_scoring_snapshots', 'select'
  ),
  'service workers cannot bypass the snapshot RPCs with direct table reads'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'api.service_replace_fantasy_fixture_points(uuid,uuid,bigint,bigint,jsonb)',
    'execute'
  ),
  'the trusted service role can replace a complete fixture scoring snapshot'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'api.service_replace_fantasy_fixture_points(uuid,uuid,bigint,bigint,jsonb)',
    'execute'
  ),
  'browser users cannot replace fixture scoring snapshots'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'api.service_validate_fantasy_scoring_scope(uuid,uuid,bigint,uuid[],uuid[])',
    'execute'
  ) and not has_function_privilege(
    'authenticated',
    'api.service_validate_fantasy_scoring_scope(uuid,uuid,bigint,uuid[],uuid[])',
    'execute'
  ),
  'only the trusted service role can validate a scoring manifest scope'
);
select extensions.ok(
  not has_function_privilege(
    'service_role',
    'api.service_upsert_fantasy_player_points(uuid,uuid,uuid,text,integer,text,bigint,integer,app.fantasy_points_state)',
    'execute'
  ),
  'the correction-unsafe legacy single-event writer is disabled'
);

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('a0000001-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (
  id, slug, name, short_name, competition_type, country_id
) values (
  'a1000001-0000-4000-8000-000000000001',
  'scoring-test', 'Scoring Test', 'ST', 'league',
  'a0000001-0000-4000-8000-000000000001'
);
insert into app.seasons (
  id, competition_id, label, starts_on, ends_on, status, is_current
) values (
  'a2000001-0000-4000-8000-000000000001',
  'a1000001-0000-4000-8000-000000000001',
  '2089/90', '2089-08-01', '2090-06-30', 'active', true
);
insert into app.rounds (id, season_id, round_number, name, status)
values (
  'a3000001-0000-4000-8000-000000000001',
  'a2000001-0000-4000-8000-000000000001',
  1, 'Gameweek 1', 'active'
);
insert into app.teams (id, slug, name, short_name, code, country_id) values
  (
    'a4000001-0000-4000-8000-000000000001',
    'scoring-home', 'Scoring Home', 'SH', 'SHM',
    'a0000001-0000-4000-8000-000000000001'
  ),
  (
    'a4000002-0000-4000-8000-000000000001',
    'scoring-away', 'Scoring Away', 'SA', 'SAW',
    'a0000001-0000-4000-8000-000000000001'
  );

insert into app.players (id, slug, full_name, display_name, position)
select ('a5' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'scoring-player-' || i,
  'Scoring Player ' || i,
  'Player ' || i,
  case
    when i <= 2 then 'goalkeeper'::app.football_position
    when i <= 7 or i > 15 then 'defender'::app.football_position
    when i <= 12 then 'midfielder'::app.football_position
    else 'forward'::app.football_position
  end
from generate_series(1, 23) i;

insert into app.fixtures (
  id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, period, home_score, away_score,
  provider_updated_at, source_sequence, source_version, finalized_at
) values (
  'a6000001-0000-4000-8000-000000000001',
  'a1000001-0000-4000-8000-000000000001',
  'a2000001-0000-4000-8000-000000000001',
  'a3000001-0000-4000-8000-000000000001',
  'a4000001-0000-4000-8000-000000000001',
  'a4000002-0000-4000-8000-000000000001',
  '2090-01-01T12:00:00Z', 'finished', 'post_match', 1, 0,
  '2090-01-01T14:00:00Z', 101, 'test:101', '2090-01-01T14:00:00Z'
);

insert into app.fantasy_competitions (
  id, football_competition_id, slug, name, active
) values (
  'a7000001-0000-4000-8000-000000000001',
  'a1000001-0000-4000-8000-000000000001',
  'scoring-test', 'Scoring Test', true
);
insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id,
  name, status, starts_at, ends_at
) values (
  'a8000001-0000-4000-8000-000000000001',
  'a7000001-0000-4000-8000-000000000001',
  'a2000001-0000-4000-8000-000000000001',
  'f6100000-0000-4000-8000-000000000100',
  '2089/90', 'active', '2089-08-01', '2090-06-30'
);
insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, points_state
) values (
  'a9000001-0000-4000-8000-000000000001',
  'a8000001-0000-4000-8000-000000000001',
  'a3000001-0000-4000-8000-000000000001',
  1, 'Gameweek 1', '2090-01-01T10:30:00Z', '2090-01-01T12:00:00Z',
  '2090-01-08T12:00:00Z', 'locked', 'provisional'
);
insert into app.fantasy_fixture_assignments (
  id, fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, assignment_status,
  resolution, counts_points, frozen_at, source_version
) values (
  'b4000001-0000-4000-8000-000000000001',
  'a8000001-0000-4000-8000-000000000001',
  'a6000001-0000-4000-8000-000000000001',
  'a9000001-0000-4000-8000-000000000001',
  'a9000001-0000-4000-8000-000000000001',
  '2090-01-01T12:00:00Z', '2090-01-01T12:00:00Z',
  'confirmed', 'completed_in_window', true, '2090-01-01T10:30:00Z', 1
);

insert into app.fantasy_players (
  id, fantasy_season_id, football_player_id, football_team_id,
  position_id, price, status, eligible, active
)
select ('b0' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'a8000001-0000-4000-8000-000000000001',
  ('a5' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  case when i <= 11 or i = 23
    then 'a4000001-0000-4000-8000-000000000001'::uuid
    else 'a4000002-0000-4000-8000-000000000001'::uuid end,
  (select position.id from app.fantasy_positions position where position.code = case
    when i <= 2 then 'GK'
    when i <= 7 or i > 15 then 'DEF'
    when i <= 12 then 'MID'
    else 'FWD' end),
  6, 'available', true, true
from generate_series(1, 23) i;

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'b1000001-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'scoring-owner@example.test',
  statement_timestamp(), 'hash', '{}', '{"username":"scoring_owner"}',
  statement_timestamp(), statement_timestamp()
);
insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name,
  bank, team_value, free_transfers, version, status
) values (
  'b2000001-0000-4000-8000-000000000001',
  'b1000001-0000-4000-8000-000000000001',
  'a8000001-0000-4000-8000-000000000001',
  'a9000001-0000-4000-8000-000000000001',
  'Scoring Eleven', 10, 90, 1, 1, 'active'
);
insert into app.fantasy_lineups (
  id, fantasy_team_id, gameweek_id, team_version
) values (
  'b3000001-0000-4000-8000-000000000001',
  'b2000001-0000-4000-8000-000000000001',
  'a9000001-0000-4000-8000-000000000001', 1
);
insert into app.fantasy_lineup_players (
  lineup_id, fantasy_player_id, slot, slot_order,
  captain, vice_captain, multiplier, snapshot_price
)
select 'b3000001-0000-4000-8000-000000000001',
  ('b0' || lpad(selection.player_number::text, 6, '0')
    || '-0000-4000-8000-000000000001')::uuid,
  selection.slot::app.fantasy_lineup_slot,
  selection.slot_order,
  selection.player_number = 8,
  selection.player_number = 13,
  case when selection.player_number = 8 then 2 else 1 end,
  6
from (values
  (1, 'starter', 1),
  (3, 'starter', 2), (4, 'starter', 3), (5, 'starter', 4),
  (8, 'starter', 5), (9, 'starter', 6), (10, 'starter', 7), (11, 'starter', 8),
  (13, 'starter', 9), (14, 'starter', 10), (15, 'starter', 11),
  (2, 'bench', 1), (6, 'bench', 2), (7, 'bench', 3), (12, 'bench', 4)
) as selection(player_number, slot, slot_order);

select set_config('test.initial_fixture_points', (
  select jsonb_agg(jsonb_build_object(
    'fantasy_player_id',
      ('b0' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
    'football_team_id', case when i <= 11 or i = 23
      then 'a4000001-0000-4000-8000-000000000001'::uuid
      else 'a4000002-0000-4000-8000-000000000001'::uuid end,
    'started', i <> 3,
    'did_play', true,
    'minutes_played', case when i = 3 then 30 else 90 end,
    'events', case
      when i = 3 then '[{"category":"goal","points":6}]'::jsonb
      when i = 6 then '[{"category":"appearance","points":2}]'::jsonb
      when i = 8 then '[{"category":"goal","points":5}]'::jsonb
      else '[]'::jsonb end
  ) order by i)::text
  from generate_series(1, 23) i
), true);
select set_config('test.corrected_fixture_points', (
  select jsonb_agg(jsonb_build_object(
    'fantasy_player_id',
      ('b0' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
    'football_team_id', case when i <= 11 or i = 23
      then 'a4000001-0000-4000-8000-000000000001'::uuid
      else 'a4000002-0000-4000-8000-000000000001'::uuid end,
    'started', i <> 3,
    'did_play', i <> 3,
    'minutes_played', case when i = 3 then 0 else 90 end,
    'events', case
      when i = 6 then '[{"category":"appearance","points":2}]'::jsonb
      when i = 8 then '[{"category":"goal","points":5}]'::jsonb
      else '[]'::jsonb end
  ) order by i)::text
  from generate_series(1, 23) i
), true);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select extensions.is(
  api.service_validate_fantasy_scoring_scope(
    'a9000001-0000-4000-8000-000000000001',
    'a8000001-0000-4000-8000-000000000001',
    1,
    array['a6000001-0000-4000-8000-000000000001'::uuid],
    '{}'::uuid[]
  ) ->> 'fixtureCount',
  '1',
  'the worker scope exactly matches the gameweek season and assigned fixtures'
);
select extensions.throws_ok(
  $$select api.service_validate_fantasy_scoring_scope(
      'a9000001-0000-4000-8000-000000000001',
      'a8000001-0000-4000-8000-000000000001',
      1, '{}'::uuid[], '{}'::uuid[]
    )$$,
  'PT400', 'validation_failed',
  'an empty fixture scope fails before any scoring mutation'
);
select extensions.throws_ok(
  $$select api.service_validate_fantasy_scoring_scope(
      'a9000001-0000-4000-8000-000000000001',
      'a8000002-0000-4000-8000-000000000001',
      1,
      array['a6000001-0000-4000-8000-000000000001'::uuid],
      '{}'::uuid[]
    )$$,
  'PT409', 'fantasy_scoring_scope_mismatch',
  'a manifest cannot point a gameweek at a different Fantasy season'
);
select extensions.throws_ok(
  $$select api.service_validate_fantasy_scoring_scope(
      'a9000001-0000-4000-8000-000000000001',
      'a8000001-0000-4000-8000-000000000001',
      1,
      array['a6000001-0000-4000-8000-000000000001'::uuid],
      array['ae000001-0000-4000-8000-000000000001'::uuid]
    )$$,
  'PT409', 'fantasy_scoring_scope_mismatch',
  'a manifest cannot omit or invent an active league ranking scope'
);

select set_config('test.first_snapshot', api.service_replace_fantasy_fixture_points(
  'a9000001-0000-4000-8000-000000000001',
  'a6000001-0000-4000-8000-000000000001',
  100, 1, current_setting('test.initial_fixture_points')::jsonb
)::text, true);
select extensions.is(
  current_setting('test.first_snapshot')::jsonb ->> 'stableResult',
  'false',
  'the first complete fixture snapshot is materialized'
);
select extensions.is(
  api.service_replace_fantasy_fixture_points(
    'a9000001-0000-4000-8000-000000000001',
    'a6000001-0000-4000-8000-000000000001',
    100, 1, current_setting('test.initial_fixture_points')::jsonb
  ) ->> 'stableResult',
  'true',
  'an exact fixture retry is idempotent'
);
select extensions.throws_ok(
  $$select api.service_replace_fantasy_fixture_points(
      'a9000001-0000-4000-8000-000000000001',
      'a6000001-0000-4000-8000-000000000001',
      100, 1, current_setting('test.corrected_fixture_points')::jsonb
    )$$,
  'PT409', 'input_version_conflict',
  'the same input version cannot be reused with different fixture facts'
);
select set_config('test.corrected_snapshot', api.service_replace_fantasy_fixture_points(
  'a9000001-0000-4000-8000-000000000001',
  'a6000001-0000-4000-8000-000000000001',
  101, 1, current_setting('test.corrected_fixture_points')::jsonb
)::text, true);
select extensions.throws_ok(
  $$select api.service_replace_fantasy_fixture_points(
      'a9000001-0000-4000-8000-000000000001',
      'a6000001-0000-4000-8000-000000000001',
      100, 1, current_setting('test.initial_fixture_points')::jsonb
    )$$,
  'PT409', 'stale_update',
  'an older fixture input version cannot replace a newer correction'
);

select extensions.is(
  (select provisional_points from app.fantasy_player_gameweek_points
   where fantasy_player_id = 'b0000003-0000-4000-8000-000000000001'
     and gameweek_id = 'a9000001-0000-4000-8000-000000000001'),
  0,
  'a correction removes the previous player points instead of accumulating them'
);
select extensions.is(
  (select row(provisional_points, minutes_played, did_play)::text
   from app.fantasy_player_gameweek_points
   where fantasy_player_id = 'b0000003-0000-4000-8000-000000000001'
     and gameweek_id = 'a9000001-0000-4000-8000-000000000001'),
  '(0,0,f)',
  'a correction replaces participation facts atomically'
);
select extensions.is(
  (select row(count(*), count(*) filter (where superseded_at is null))::text
   from app.fantasy_player_point_events
   where fixture_id = 'a6000001-0000-4000-8000-000000000001'
     and gameweek_id = 'a9000001-0000-4000-8000-000000000001'),
  '(3,2)',
  'same-category corrections reuse source keys and only corrected events remain active'
);
select extensions.is(
  (select row(count(*), count(*) filter (where superseded_at is null))::text
   from app_private.fantasy_fixture_scoring_snapshots
   where fixture_id = 'a6000001-0000-4000-8000-000000000001'),
  '(2,1)',
  'snapshot history is retained with exactly one current version'
);

select extensions.throws_ok(
  $$select api.service_complete_fantasy_gameweek(
      'a9000001-0000-4000-8000-000000000001', 1
    )$$,
  'PT409', 'gameweek_not_finalizable',
  'completion fails closed before player and team materialization'
);

select set_config('test.player_finalization', api.service_finalize_fantasy_player_points(
  'a9000001-0000-4000-8000-000000000001', 1, null, 100
)::text, true);
select extensions.is(
  current_setting('test.player_finalization')::jsonb ->> 'finalized',
  '23',
  'all active player totals are finalized in the bounded player batch'
);
select extensions.is(
  (select row(status, points_state)::text from app.fantasy_gameweeks
   where id = 'a9000001-0000-4000-8000-000000000001'),
  '(finalizing,provisional)',
  'complete final fixture coverage advances a locked gameweek into finalization'
);
select extensions.is(
  api.service_replace_fantasy_fixture_points(
    'a9000001-0000-4000-8000-000000000001',
    'a6000001-0000-4000-8000-000000000001',
    101, 1, current_setting('test.corrected_fixture_points')::jsonb
  ) ->> 'stableResult',
  'true',
  'an exact snapshot replay remains idempotent after finalization starts'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_player_gameweek_points
   where gameweek_id = 'a9000001-0000-4000-8000-000000000001'
     and final_points is not null and calculation_version = 1),
  23,
  'finalization also creates explicit zero totals for non-scoring active players'
);
select extensions.throws_ok(
  $$select api.service_complete_fantasy_gameweek(
      'a9000001-0000-4000-8000-000000000001', 1
    )$$,
  'PT409', 'gameweek_not_finalizable',
  'completion still fails closed before team materialization'
);

select set_config('test.team_materialization', api.service_materialize_fantasy_team_results(
  'a9000001-0000-4000-8000-000000000001', 1, null, 10
)::text, true);
select extensions.is(
  current_setting('test.team_materialization')::jsonb ->> 'materialized',
  '1',
  'the owned team result is materialized in a bounded team batch'
);
select extensions.is(
  (select row(player_out_id, player_in_id, sequence_number, reason)::text
   from app.fantasy_auto_substitutions
   where lineup_id = 'b3000001-0000-4000-8000-000000000001'),
  '(b0000003-0000-4000-8000-000000000001,b0000006-0000-4000-8000-000000000001,1,outfield_did_not_play)',
  'the first legal playing defender is auto-substituted in bench order'
);
select extensions.is(
  (select row(starting_points, bench_points, captain_points, transfer_hit,
              provisional_score, state, calculation_version)::text
   from app.fantasy_team_gameweek_results
   where fantasy_team_id = 'b2000001-0000-4000-8000-000000000001'
     and gameweek_id = 'a9000001-0000-4000-8000-000000000001'),
  '(7,2,5,0,12,provisional,1)',
  'team materialization applies the auto-sub and captain bonus exactly once'
);
select extensions.throws_ok(
  $$select api.service_complete_fantasy_gameweek(
      'a9000001-0000-4000-8000-000000000001', 1
    )$$,
  'PT409', 'gameweek_not_finalizable',
  'completion rejects a provisional team result'
);

-- Re-materialize the still-provisional result with Bench Boost and a confirmed
-- four-point transfer hit so chip, captain, bench, and hit semantics are all
-- exercised independently of the ordinary auto-sub assertion above.
delete from app.fantasy_auto_substitutions
where lineup_id = 'b3000001-0000-4000-8000-000000000001';
delete from app.fantasy_team_gameweek_results
where fantasy_team_id = 'b2000001-0000-4000-8000-000000000001'
  and gameweek_id = 'a9000001-0000-4000-8000-000000000001';
insert into app.fantasy_chip_uses (
  id, fantasy_team_id, gameweek_id, chip_type, chip_rule_id,
  activation_idempotency_key
) values (
  'b5000001-0000-4000-8000-000000000001',
  'b2000001-0000-4000-8000-000000000001',
  'a9000001-0000-4000-8000-000000000001',
  'bench_boost', 'f6200000-0000-4000-8000-000000000104',
  'b6000001-0000-4000-8000-000000000001'
);
insert into app.fantasy_transfer_batches (
  id, fantasy_team_id, gameweek_id, idempotency_key,
  base_team_version, resulting_team_version, transfers_count,
  free_transfers_before, free_transfers_used, point_hit,
  bank_before, bank_after, status
) values (
  'b7000001-0000-4000-8000-000000000001',
  'b2000001-0000-4000-8000-000000000001',
  'a9000001-0000-4000-8000-000000000001',
  'b8000001-0000-4000-8000-000000000001',
  1, 2, 1, 1, 0, 4, 10, 10, 'confirmed'
);
select extensions.is(
  api.service_materialize_fantasy_team_results(
    'a9000001-0000-4000-8000-000000000001', 1, null, 10
  ) ->> 'materialized',
  '1',
  'a missing provisional result can be deterministically materialized again'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_auto_substitutions
   where lineup_id = 'b3000001-0000-4000-8000-000000000001'),
  0,
  'Bench Boost suppresses automatic substitutions'
);
select extensions.is(
  (select row(starting_points, bench_points, captain_points, transfer_hit,
              provisional_score, chip_type)::text
   from app.fantasy_team_gameweek_results
   where fantasy_team_id = 'b2000001-0000-4000-8000-000000000001'
     and gameweek_id = 'a9000001-0000-4000-8000-000000000001'),
  '(5,2,5,4,8,bench_boost)',
  'Bench Boost adds the bench, captain bonus applies once, and transfer hits subtract once'
);

select extensions.is(
  api.service_finalize_fantasy_team_results(
    'a9000001-0000-4000-8000-000000000001', 1, null, 10
  ) ->> 'finalized',
  '1',
  'the materialized team result is finalized in a bounded batch'
);
select extensions.throws_ok(
  $$select api.service_complete_fantasy_gameweek(
      'a9000001-0000-4000-8000-000000000001', 1
    )$$,
  'PT409', 'gameweek_not_finalizable',
  'completion rejects finalized scores until rollover and rankings exist'
);
select extensions.is(
  api.service_roll_fantasy_free_transfers(
    'a9000001-0000-4000-8000-000000000001', 10
  ) ->> 'updated',
  '1',
  'the team receives exactly one free-transfer rollover'
);
select extensions.throws_ok(
  $$select api.service_complete_fantasy_gameweek(
      'a9000001-0000-4000-8000-000000000001', 1
    )$$,
  'PT409', 'gameweek_not_finalizable',
  'completion rejects a rolled team until ranking materialization exists'
);
select api.service_recalculate_fantasy_rankings(
  'a8000001-0000-4000-8000-000000000001',
  'a9000001-0000-4000-8000-000000000001', null, 1
);
select extensions.throws_ok(
  $$select api.service_complete_fantasy_gameweek(
      'a9000001-0000-4000-8000-000000000001', 1
    )$$,
  'PT409', 'gameweek_not_finalizable',
  'completion requires both gameweek and overall ranking scopes'
);
select api.service_recalculate_fantasy_rankings(
  'a8000001-0000-4000-8000-000000000001', null, null, 1
);
select extensions.is(
  api.service_complete_fantasy_gameweek(
    'a9000001-0000-4000-8000-000000000001', 1
  ) ->> 'stableResult',
  'false',
  'completion succeeds only after every scoring and ranking guard is satisfied'
);
select extensions.is(
  (select row(status, points_state, scoring_input_version)::text
   from app.fantasy_gameweeks
   where id = 'a9000001-0000-4000-8000-000000000001'),
  '(finalized,final,1)',
  'successful completion atomically marks the gameweek final'
);
select extensions.is(
  (select row(final_score, state)::text
   from app.fantasy_team_gameweek_results
   where fantasy_team_id = 'b2000001-0000-4000-8000-000000000001'
     and gameweek_id = 'a9000001-0000-4000-8000-000000000001'),
  '(8,final)',
  'the authoritative final team score remains stable'
);
select extensions.is(
  (select free_transfers from app.fantasy_teams
   where id = 'b2000001-0000-4000-8000-000000000001'),
  2,
  'free transfers are rolled once up to the configured cap'
);
select extensions.is(
  api.service_complete_fantasy_gameweek(
    'a9000001-0000-4000-8000-000000000001', 1
  ) ->> 'stableResult',
  'true',
  'a repeated completion call returns the stable finalized result'
);
select extensions.is(
  api.service_replace_fantasy_fixture_points(
    'a9000001-0000-4000-8000-000000000001',
    'a6000001-0000-4000-8000-000000000001',
    101, 1, current_setting('test.corrected_fixture_points')::jsonb
  ) ->> 'stableResult',
  'true',
  'an exact finalized snapshot replay is stable and performs no mutation'
);
select extensions.throws_ok(
  $$select api.service_complete_fantasy_gameweek(
      'a9000001-0000-4000-8000-000000000001', 2
    )$$,
  'PT409', 'stale_update',
  'a finalized gameweek rejects a mismatched calculation version'
);
select extensions.throws_ok(
  $$select api.service_replace_fantasy_fixture_points(
      'a9000001-0000-4000-8000-000000000001',
      'a6000001-0000-4000-8000-000000000001',
      102, 2, current_setting('test.corrected_fixture_points')::jsonb
    )$$,
  'PT409', 'gameweek_not_finalizable',
  'ordinary fixture replacement cannot mutate a finalized gameweek'
);

select * from extensions.finish();
rollback;
