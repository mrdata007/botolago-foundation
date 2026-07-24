begin;

select extensions.no_plan();

select extensions.is(
  (select ruleset_code from app.fantasy_rulesets
    where id = 'f6100000-0000-4000-8000-000000000100'),
  'botolago-fantasy-v1.0',
  'Ruleset v1.0 is published under a stable code'
);
select extensions.is(
  (select initial_budget::text from app.fantasy_rulesets
    where id = 'f6100000-0000-4000-8000-000000000100'),
  '100.00', 'starting budget is 100.0 credits'
);
select extensions.is(
  (select row(squad_size, max_players_per_club, initial_free_transfers,
    max_free_transfer_rollover, transfer_hit_cost)::text
   from app.fantasy_rulesets where id = 'f6100000-0000-4000-8000-000000000100'),
  '(15,3,1,2,4)', 'squad, club and transfer rules match v1.0'
);

select extensions.results_eq(
  $$select position.code, rule.squad_quota, rule.starting_minimum,
      rule.starting_maximum, rule.goal_points, rule.clean_sheet_points
    from app.fantasy_position_rules rule
    join app.fantasy_positions position on position.id = rule.position_id
    where rule.ruleset_id = 'f6100000-0000-4000-8000-000000000100'
    order by position.display_order$$,
  $$values
    ('GK'::text, 2, 1, 1, 10, 4),
    ('DEF'::text, 5, 3, 5, 6, 4),
    ('MID'::text, 5, 2, 5, 5, 1),
    ('FWD'::text, 3, 1, 3, 4, 0)$$,
  'position quotas, formations and position scoring match v1.0'
);

select extensions.is(
  (select count(*)::integer from app.fantasy_scoring_rules
   where ruleset_id = 'f6100000-0000-4000-8000-000000000100'),
  12, 'v1.0 publishes exactly the approved non-goal scoring rules'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_scoring_rules
   where ruleset_id = 'f6100000-0000-4000-8000-000000000100'
     and category in ('bonus', 'player_of_match', 'inferred_assist')),
  0, 'bonus, player-of-match and inferred assists are not published'
);
select extensions.is(
  (select row(bonus_points_enabled, player_of_match_enabled,
    fixture_difficulty_enabled, official_assists_only)::text
   from app.fantasy_ruleset_features
   where ruleset_id = 'f6100000-0000-4000-8000-000000000100'),
  '(f,f,f,t)', 'feature flags fail closed for unpublished v1.0 features'
);

select extensions.is(
  (select row(minutes_before_first_fixture, grace_period_seconds)::text
   from app.fantasy_deadline_rules
   where ruleset_id = 'f6100000-0000-4000-8000-000000000100'),
  '(90,0)', 'deadline is 90 minutes before kickoff with no grace period'
);
select extensions.is(
  app_private.fantasy_calculate_deadline(
    'f6100000-0000-4000-8000-000000000100', '2030-08-01T18:00:00Z'
  ),
  '2030-08-01T16:30:00Z'::timestamptz,
  'server deadline calculation is deterministic'
);

select extensions.results_eq(
  $$select allocation_code, chip_type::text, starts_at_gameweek,
      ends_at_gameweek, activation_cancellable
    from app.fantasy_chip_rules
    where ruleset_id = 'f6100000-0000-4000-8000-000000000100'
    order by id$$,
  $$values
    ('wildcard_1'::text, 'wildcard'::text, 1, 15, false),
    ('wildcard_2'::text, 'wildcard'::text, 16, null::integer, false),
    ('free_hit'::text, 'free_hit'::text, 1, null::integer, false),
    ('bench_boost'::text, 'bench_boost'::text, 1, null::integer, false),
    ('triple_captain'::text, 'triple_captain'::text, 1, null::integer, false)$$,
  'approved chip allocations and non-cancellable activation are encoded'
);

select extensions.is(
  app_private.fantasy_calculate_price_movement(
    'f6100000-0000-4000-8000-000000000100', 1499, 0, 50000
  )::text,
  '0', 'price movement remains zero below the three-percent threshold'
);
select extensions.is(
  app_private.fantasy_calculate_price_movement(
    'f6100000-0000-4000-8000-000000000100', 1500, 0, 50000
  )::text,
  '0.10', 'three-percent demand increases price by 0.1'
);
select extensions.is(
  app_private.fantasy_calculate_price_movement(
    'f6100000-0000-4000-8000-000000000100', 4000, 0, 50000
  )::text,
  '0.20', 'eight-percent demand increases price by 0.2'
);
select extensions.is(
  app_private.fantasy_calculate_price_movement(
    'f6100000-0000-4000-8000-000000000100', 0, 4000, 50000
  )::text,
  '-0.20', 'negative eight-percent demand decreases price by 0.2'
);
select extensions.is(
  app_private.fantasy_calculate_sale_price(
    'f6100000-0000-4000-8000-000000000100', 7.0, 7.5
  )::text,
  '7.20', 'sale price retains half of each complete 0.2 gain'
);

select extensions.results_eq(
  $$select priority, criterion, direction
    from app.fantasy_ranking_tiebreak_rules
    where ruleset_id = 'f6100000-0000-4000-8000-000000000100'
    order by priority$$,
  $$values
    (1, 'total_points'::text, 'desc'::text),
    (2, 'transfer_hit_points'::text, 'asc'::text),
    (3, 'confirmed_transfers'::text, 'asc'::text),
    (4, 'latest_finalized_gameweek_score'::text, 'desc'::text),
    (5, 'team_created_at'::text, 'asc'::text),
    (6, 'team_uuid'::text, 'asc'::text)$$,
  'ranking tie-break order is fully versioned'
);

select extensions.is(
  (select row(post_lock_completion_window_hours, correction_window_hours,
    unresolved_gameweek_remains_provisional, aggregate_double_gameweek_fixtures)::text
   from app.fantasy_fixture_rules
   where ruleset_id = 'f6100000-0000-4000-8000-000000000100'),
  '(48,72,t,t)', 'exceptional fixture windows and double-gameweek behavior are encoded'
);

select extensions.ok(
  (select bool_and(relrowsecurity and relforcerowsecurity)
   from pg_class where oid in (
    'app.fantasy_ruleset_features'::regclass,
    'app.fantasy_deadline_rules'::regclass,
    'app.fantasy_chip_rules'::regclass,
    'app.fantasy_price_rules'::regclass,
    'app.fantasy_ranking_tiebreak_rules'::regclass,
    'app.fantasy_fixture_rules'::regclass,
    'app.fantasy_fixture_assignments'::regclass,
    'app_private.fantasy_deadline_change_audit'::regclass
  )),
  'all new v1.0 tables enable and force RLS'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'app.fantasy_price_rules', 'select'),
  'browser users cannot read canonical price configuration directly'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'api.service_apply_fantasy_price_changes(uuid,bigint,uuid,integer)',
    'execute'
  ),
  'browser users cannot invoke the price worker'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'api.service_apply_fantasy_price_changes(uuid,bigint,uuid,integer)',
    'execute'
  ),
  'trusted worker role can invoke the bounded price worker'
);

select * from extensions.finish();
rollback;
