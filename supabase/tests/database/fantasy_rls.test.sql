begin;

select extensions.no_plan();

select extensions.ok(
  (select bool_and(relrowsecurity and relforcerowsecurity)
   from pg_class where oid in (
    'app.fantasy_competitions'::regclass, 'app.fantasy_rulesets'::regclass,
    'app.fantasy_seasons'::regclass, 'app.fantasy_gameweeks'::regclass,
    'app.fantasy_players'::regclass, 'app.fantasy_teams'::regclass,
    'app.fantasy_squad_memberships'::regclass, 'app.fantasy_lineups'::regclass,
    'app.fantasy_lineup_players'::regclass, 'app.fantasy_transfer_batches'::regclass,
    'app.fantasy_chip_uses'::regclass, 'app.fantasy_player_point_events'::regclass,
    'app.fantasy_team_gameweek_results'::regclass, 'app.fantasy_leagues'::regclass,
    'app.fantasy_rankings'::regclass, 'app_private.fantasy_job_runs'::regclass,
    'app_private.fantasy_mutation_audit'::regclass
  )),
  'all canonical and private Fantasy tables enable and force RLS'
);

select extensions.ok(not has_table_privilege('anon', 'app.fantasy_players', 'select'),
  'anonymous cannot read canonical player records directly');
select extensions.ok(not has_table_privilege('authenticated', 'app.fantasy_teams', 'insert'),
  'authenticated browser cannot create teams directly');
select extensions.ok(not has_table_privilege('authenticated', 'app.fantasy_player_point_events', 'insert'),
  'authenticated browser cannot create point events');
select extensions.ok(not has_table_privilege('authenticated', 'app.fantasy_rankings', 'update'),
  'authenticated browser cannot alter rankings');
select extensions.ok(not has_table_privilege('service_role', 'app_private.fantasy_job_runs', 'select'),
  'service role accesses private job ledgers only through bounded RPCs');
select extensions.ok(has_function_privilege(
  'anon', 'api.fantasy_gameweeks(uuid,integer,integer)', 'execute'),
  'anonymous can execute the bounded gameweek read contract');
select extensions.ok(not has_function_privilege(
  'anon', 'api.archive_fantasy_league(uuid,uuid)', 'execute'),
  'anonymous cannot archive Fantasy leagues');
select extensions.ok(has_function_privilege(
  'authenticated', 'api.archive_fantasy_league(uuid,uuid)', 'execute'),
  'authenticated owners can reach the ownership-enforcing archive contract');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select api.create_fantasy_team(gen_random_uuid(), gen_random_uuid(), 'Bad Team', '[]', gen_random_uuid())$$,
  '42501', null, 'anonymous cannot invoke owner mutations'
);
select extensions.throws_ok(
  $$select api.service_begin_fantasy_job('finalize_gameweek')$$,
  '42501', null, 'anonymous cannot invoke Fantasy workers'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select * from app.fantasy_teams$$,
  '42501', null, 'authenticated browser cannot bypass API contracts'
);
select extensions.throws_ok(
  $$select * from app_private.fantasy_mutation_audit$$,
  '42501', null, 'authenticated browser cannot read internal Fantasy audits'
);
select extensions.throws_ok(
  $$select api.service_recalculate_fantasy_rankings(gen_random_uuid())$$,
  '42501', null, 'authenticated browser cannot invoke ranking workers'
);
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.ok(
  api.service_begin_fantasy_job('recalculate_rankings') is not null,
  'trusted worker can begin a bounded Fantasy job'
);
select extensions.throws_ok(
  $$select * from app_private.fantasy_job_runs$$,
  '42501', null, 'service role cannot enumerate private job rows directly'
);
reset role;

select * from extensions.finish();
rollback;
