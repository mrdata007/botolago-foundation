begin;
select extensions.no_plan();

select extensions.ok(not has_function_privilege('anon',
  'api.service_advance_fantasy_lifecycle(uuid,bigint,integer)', 'execute'),
  'anonymous callers cannot advance lifecycle');
select extensions.ok(not has_function_privilege('authenticated',
  'api.service_fantasy_lifecycle_state(uuid)', 'execute'),
  'ordinary users cannot inspect private worker state');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'app_private.fantasy_lifecycle_transitions'::regclass),
  'lifecycle audit enables and forces RLS');

insert into app.countries(id, iso_alpha2, iso_alpha3)
values ('fc000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions(id, slug, name, short_name, competition_type, country_id)
values ('fc100000-0000-4000-8000-000000000001', 'lifecycle-test', 'Lifecycle Test', 'LCT',
  'league', 'fc000000-0000-4000-8000-000000000001');
insert into app.seasons(id, competition_id, label, starts_on, ends_on, status, is_current)
values ('fc200000-0000-4000-8000-000000000001', 'fc100000-0000-4000-8000-000000000001',
  'Lifecycle season', current_date - 1, current_date + 100, 'active', true);
insert into app.rounds(id, season_id, round_number, name)
values ('fc300000-0000-4000-8000-000000000001', 'fc200000-0000-4000-8000-000000000001',
  1, 'Gameweek 1');
insert into app.teams(id, slug, name, short_name, code, country_id)
select md5('lifecycle-club-' || n)::uuid, 'lifecycle-club-' || n, 'Lifecycle Club ' || n,
  'LC' || n, 'L' || n, 'fc000000-0000-4000-8000-000000000001'
from generate_series(1, 2) n;
insert into app.fixtures(id, competition_id, season_id, round_id, home_team_id,
  away_team_id, kickoff_at, provider_updated_at, source_sequence)
values ('fc400000-0000-4000-8000-000000000001', 'fc100000-0000-4000-8000-000000000001',
  'fc200000-0000-4000-8000-000000000001', 'fc300000-0000-4000-8000-000000000001',
  md5('lifecycle-club-1')::uuid, md5('lifecycle-club-2')::uuid,
  statement_timestamp() + interval '2 days', statement_timestamp(), 1);
insert into app.fantasy_competitions(id, football_competition_id, slug, name, active)
values ('fc500000-0000-4000-8000-000000000001', 'fc100000-0000-4000-8000-000000000001',
  'lifecycle-test', 'Lifecycle Test', true);
insert into app.fantasy_seasons(id, fantasy_competition_id, football_season_id,
  ruleset_id, name, status, starts_at, ends_at)
values ('fc600000-0000-4000-8000-000000000001', 'fc500000-0000-4000-8000-000000000001',
  'fc200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  'Lifecycle season', 'registration_open', current_date - 1, current_date + 100);
insert into app.fantasy_gameweeks(id, fantasy_season_id, football_round_id,
  sequence_number, name, deadline_at, starts_at, ends_at, status)
values ('fc700000-0000-4000-8000-000000000001', 'fc600000-0000-4000-8000-000000000001',
  'fc300000-0000-4000-8000-000000000001', 1, 'Gameweek 1',
  statement_timestamp() + interval '2 days' - interval '90 minutes',
  statement_timestamp() + interval '2 days', statement_timestamp() + interval '3 days', 'open');
insert into app.fantasy_fixture_assignments(fantasy_season_id, fixture_id, gameweek_id,
  original_gameweek_id, original_kickoff_at, assigned_kickoff_at, source_version)
values ('fc600000-0000-4000-8000-000000000001', 'fc400000-0000-4000-8000-000000000001',
  'fc700000-0000-4000-8000-000000000001', 'fc700000-0000-4000-8000-000000000001',
  statement_timestamp() + interval '2 days', statement_timestamp() + interval '2 days', 1);

-- Only lineup lock metadata is exercised here. Scoring separately verifies
-- complete immutable squad/player snapshots before accepting any result.
insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select md5('lifecycle-user-' || n)::uuid, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'lifecycle-' || n || '@example.test', 'hash',
  '{}'::jsonb, jsonb_build_object('username', 'lifecycle_user_' || n),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 2) n;
insert into app.fantasy_teams(id, user_id, fantasy_season_id, current_gameweek_id,
  name, bank, team_value, free_transfers)
select md5('lifecycle-team-' || n)::uuid, md5('lifecycle-user-' || n)::uuid,
  'fc600000-0000-4000-8000-000000000001', 'fc700000-0000-4000-8000-000000000001',
  'Lifecycle Team ' || n, 10, 90, 1 from generate_series(1, 2) n;
insert into app.fantasy_lineups(fantasy_team_id, gameweek_id, team_version)
select id, current_gameweek_id, version from app.fantasy_teams
where fantasy_season_id = 'fc600000-0000-4000-8000-000000000001';

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok($$select api.service_advance_fantasy_lifecycle(
  'fc700000-0000-4000-8000-000000000001', 1, 1)$$,
  'PT403', 'forbidden', 'function independently rejects non-service context');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.service_advance_fantasy_lifecycle(
  'fc700000-0000-4000-8000-000000000001', 1, 1)->>'waitingReason',
  'deadline_not_reached', 'runner cannot lock before the database deadline');
select extensions.throws_ok($$select api.service_advance_fantasy_lifecycle(
  'fc700000-0000-4000-8000-000000000001', 2, 1)$$,
  'PT409', 'stale_update', 'stale worker version fails closed');
select extensions.throws_ok($$select api.service_advance_fantasy_lifecycle(
  'fc700000-0000-4000-8000-000000000001', 1, null)$$,
  'PT400', 'validation_failed', 'null batch cannot bypass operation bounds');

-- Move the test's complete schedule into the past before locking.
update app.fantasy_gameweeks set deadline_at = statement_timestamp() - interval '3 hours',
  starts_at = statement_timestamp() - interval '90 minutes',
  ends_at = statement_timestamp() + interval '3 hours'
where id = 'fc700000-0000-4000-8000-000000000001';
update app.fixtures set kickoff_at = statement_timestamp() - interval '90 minutes'
where id = 'fc400000-0000-4000-8000-000000000001';
select extensions.throws_ok($$select api.service_advance_fantasy_lifecycle(
  'fc700000-0000-4000-8000-000000000001', 1, 1)$$,
  'PT409', 'fantasy_fixture_resolution_required', 'stale assignment is never silently frozen');
update app.fantasy_fixture_assignments assignment
set original_kickoff_at = fixture.kickoff_at,
  assigned_kickoff_at = fixture.kickoff_at
from app.fixtures fixture
where fixture.id = assignment.fixture_id
  and assignment.gameweek_id = 'fc700000-0000-4000-8000-000000000001';
select extensions.is(api.service_advance_fantasy_lifecycle(
  'fc700000-0000-4000-8000-000000000001', 1, 1)->>'hasMore',
  'true', 'lineup freeze uses bounded committed batches');
select extensions.is((select count(*)::integer from app.fantasy_lineups
  where gameweek_id = 'fc700000-0000-4000-8000-000000000001' and locked_at is not null),
  1, 'first batch freezes exactly one lineup');
select extensions.is(api.service_advance_fantasy_lifecycle(
  'fc700000-0000-4000-8000-000000000001', 1, 1)->>'status',
  'locked', 'resuming freezes the remaining lineup and transitions once');
select extensions.is(api.service_advance_fantasy_lifecycle(
  'fc700000-0000-4000-8000-000000000001', 2, 1)->>'waitingReason',
  'football_not_started', 'past kickoff alone never invents live football');
update app.fixtures set status = 'live_first_half', period = 'first_half'
where id = 'fc400000-0000-4000-8000-000000000001';
select extensions.is(api.service_advance_fantasy_lifecycle(
  'fc700000-0000-4000-8000-000000000001', 2, 1)->>'status',
  'live', 'canonical provider live state advances the locked gameweek');
update app.fixtures set status = 'finished', period = 'post_match', home_score = 1, away_score = 0
where id = 'fc400000-0000-4000-8000-000000000001';
select extensions.is(api.service_advance_fantasy_lifecycle(
  'fc700000-0000-4000-8000-000000000001', 3, 1)->>'waitingReason',
  'football_not_final', 'finished but unfinalized football remains live');
update app.fixtures set finalized_at = statement_timestamp()
where id = 'fc400000-0000-4000-8000-000000000001';
select extensions.is(api.service_advance_fantasy_lifecycle(
  'fc700000-0000-4000-8000-000000000001', 3, 1)->>'status',
  'provisional', 'fully finalized canonical football permits provisional scoring');
select extensions.is(api.service_advance_fantasy_lifecycle(
  'fc700000-0000-4000-8000-000000000001', 4, 1)->>'waitingReason',
  'scoring_or_finalization_required', 'lifecycle never invents or finalizes scores');
select extensions.is((select count(*)::integer from app_private.fantasy_lifecycle_transitions
  where gameweek_id = 'fc700000-0000-4000-8000-000000000001'), 3,
  'retries produce one audit record per actual transition');
select extensions.is((select count(*)::integer from app.fantasy_team_gameweek_results
  where gameweek_id = 'fc700000-0000-4000-8000-000000000001'), 0,
  'deadline runner creates no score rows');
select * from extensions.finish();
rollback;
