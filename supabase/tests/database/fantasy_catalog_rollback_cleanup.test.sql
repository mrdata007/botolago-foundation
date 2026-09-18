-- BG-0032: api.service_rollback_fantasy_catalog must clean up
-- app.fantasy_leagues, app.fantasy_league_memberships and app.fantasy_rankings
-- (all ON DELETE RESTRICT) before deleting app.fantasy_seasons, and must keep
-- refusing while any app.fantasy_teams row exists for the season.
begin;

select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('cb000000-0000-4000-8000-000000000001', 'MA', 'MAR');

insert into app.competitions (
  id, slug, name, short_name, competition_type, country_id, active
) values (
  'cb100000-0000-4000-8000-000000000001',
  'rollback-cleanup-league', 'Rollback Cleanup League', 'RCL',
  'league', 'cb000000-0000-4000-8000-000000000001', true
);

insert into app.competitions (
  id, slug, name, short_name, competition_type, country_id, active
) values (
  'cb100000-0000-4000-8000-000000000002',
  'rollback-cleanup-league-b', 'Rollback Cleanup League B', 'RCLB',
  'league', 'cb000000-0000-4000-8000-000000000001', true
);

-- Two independent football seasons: one whose Fantasy catalog is rolled back
-- (A), one that keeps a live team (B) so a league of A can carry a membership
-- referencing an existing app.fantasy_teams row without that team belonging
-- to A (A itself must have zero app.fantasy_teams rows for the PT409
-- fantasy_catalog_in_use guard to ever let the rollback proceed).
insert into app.seasons (
  id, competition_id, label, starts_on, ends_on, status, is_current
) values
  (
    'cb200000-0000-4000-8000-000000000001',
    'cb100000-0000-4000-8000-000000000001', 'Season A',
    current_date + 40, current_date + 300, 'planned', false
  ),
  (
    'cb200000-0000-4000-8000-000000000002',
    'cb100000-0000-4000-8000-000000000002', 'Season B',
    current_date + 40, current_date + 300, 'planned', false
  );

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values
  ('cb600000-0000-4000-8000-000000000001', 'cb100000-0000-4000-8000-000000000001',
    'rollback-cleanup-a', 'Rollback Cleanup A', true),
  ('cb600000-0000-4000-8000-000000000002', 'cb100000-0000-4000-8000-000000000002',
    'rollback-cleanup-b', 'Rollback Cleanup B', true);

insert into app.fantasy_rulesets (
  id, fantasy_competition_id, version, name, squad_size, initial_budget,
  max_players_per_club, initial_free_transfers, max_free_transfer_rollover,
  transfer_hit_cost, active, effective_from
) values
  ('cb610000-0000-4000-8000-000000000001', 'cb600000-0000-4000-8000-000000000001',
    1, 'Rollback Cleanup Ruleset A', 15, 100, 3, 1, 5, 4, true, statement_timestamp()),
  ('cb610000-0000-4000-8000-000000000002', 'cb600000-0000-4000-8000-000000000002',
    1, 'Rollback Cleanup Ruleset B', 15, 100, 3, 1, 5, 4, true, statement_timestamp());

insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values
  ('cb300000-0000-4000-8000-000000000001', 'cb600000-0000-4000-8000-000000000001',
    'cb200000-0000-4000-8000-000000000001', 'cb610000-0000-4000-8000-000000000001',
    'Season A', 'registration_open',
    statement_timestamp() + interval '40 days', statement_timestamp() + interval '300 days'),
  ('cb300000-0000-4000-8000-000000000002', 'cb600000-0000-4000-8000-000000000002',
    'cb200000-0000-4000-8000-000000000002', 'cb610000-0000-4000-8000-000000000002',
    'Season B', 'registration_open',
    statement_timestamp() + interval '40 days', statement_timestamp() + interval '300 days');

insert into app.fantasy_gameweeks (
  id, fantasy_season_id, sequence_number, name, deadline_at, starts_at, ends_at, status
) values
  ('cb400000-0000-4000-8000-000000000001', 'cb300000-0000-4000-8000-000000000001',
    1, 'Gameweek 1', statement_timestamp() + interval '40 days',
    statement_timestamp() + interval '41 days', statement_timestamp() + interval '48 days', 'scheduled'),
  ('cb400000-0000-4000-8000-000000000002', 'cb300000-0000-4000-8000-000000000002',
    1, 'Gameweek 1', statement_timestamp() + interval '40 days',
    statement_timestamp() + interval '41 days', statement_timestamp() + interval '48 days', 'scheduled');

insert into app_private.fantasy_catalog_activation_runs (
  id, football_season_id, fantasy_season_id, ruleset_id, source_digest,
  initial_price_algorithm, expected_team_count, expected_round_count,
  expected_fixture_count, minimum_player_count, maximum_player_count,
  player_count, gameweek_count, fixture_count
) values
  ('cb500000-0000-4000-8000-000000000001', 'cb200000-0000-4000-8000-000000000001',
    'cb300000-0000-4000-8000-000000000001', 'cb610000-0000-4000-8000-000000000001',
    repeat('a', 64), 'botolago-initial-price-v1.0', 2, 1, 1, 1, 5000, 1, 1, 1),
  ('cb500000-0000-4000-8000-000000000002', 'cb200000-0000-4000-8000-000000000002',
    'cb300000-0000-4000-8000-000000000002', 'cb610000-0000-4000-8000-000000000002',
    repeat('b', 64), 'botolago-initial-price-v1.0', 2, 1, 1, 1, 5000, 1, 1, 1);

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('cb800000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'rollback-owner@example.test', statement_timestamp(), 'hash',
    '{}', '{"username":"rollback_owner"}', statement_timestamp(), statement_timestamp()),
  ('cb800000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'rollback-member@example.test', statement_timestamp(), 'hash',
    '{}', '{"username":"rollback_member"}', statement_timestamp(), statement_timestamp());

-- League belongs to season A. Its member team belongs to season B, which is
-- allowed (BotolaGO does not constrain a league membership's team to its
-- league's season at the database level) and lets us prove the membership
-- and ranking cleanup without ever putting an app.fantasy_teams row under
-- season A itself (that would trip the fantasy_catalog_in_use guard, tested
-- separately below).
insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers
) values (
  'cb900000-0000-4000-8000-000000000001', 'cb800000-0000-4000-8000-000000000002',
  'cb300000-0000-4000-8000-000000000002', 'cb400000-0000-4000-8000-000000000002',
  'Cleanup Rovers', 0, 100, 1
);

insert into app.fantasy_leagues (
  id, fantasy_season_id, owner_user_id, name, visibility
) values (
  'cba00000-0000-4000-8000-000000000001', 'cb300000-0000-4000-8000-000000000001',
  'cb800000-0000-4000-8000-000000000001', 'Cleanup League', 'public'
);

insert into app.fantasy_league_memberships (
  id, league_id, fantasy_team_id, user_id
) values (
  'cbb00000-0000-4000-8000-000000000001', 'cba00000-0000-4000-8000-000000000001',
  'cb900000-0000-4000-8000-000000000001', 'cb800000-0000-4000-8000-000000000002'
);

insert into app.fantasy_rankings (
  id, fantasy_season_id, league_id, fantasy_team_id, rank, total_points, calculation_version, calculated_at
) values (
  'cbc00000-0000-4000-8000-000000000001', 'cb300000-0000-4000-8000-000000000001',
  'cba00000-0000-4000-8000-000000000001', 'cb900000-0000-4000-8000-000000000001',
  1, 0, 1, statement_timestamp()
);

-- (e) authorization: a non-service-role caller is rejected before anything
-- else is inspected or changed.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok(
  $$select api.service_rollback_fantasy_catalog(
    'cb500000-0000-4000-8000-000000000001', repeat('a', 64)
  )$$,
  'PT403', 'forbidden',
  'a non-service-role caller cannot roll back a Fantasy catalog activation'
);

-- (d) stale digest: the PT409 stale_update guard still refuses and changes
-- nothing.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.throws_ok(
  $$select api.service_rollback_fantasy_catalog(
    'cb500000-0000-4000-8000-000000000001', repeat('9', 64)
  )$$,
  'PT409', 'stale_update',
  'a mismatched expected source digest is rejected before anything is deleted'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_leagues
   where fantasy_season_id = 'cb300000-0000-4000-8000-000000000001'),
  1,
  'the stale-digest rejection did not touch the league'
);

-- (b) critical regression: a live app.fantasy_teams row under the season
-- being rolled back must still block everything, unchanged.
insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers
) values (
  'cb900000-0000-4000-8000-000000000002', 'cb800000-0000-4000-8000-000000000001',
  'cb300000-0000-4000-8000-000000000001', 'cb400000-0000-4000-8000-000000000001',
  'Guarded Rovers', 0, 100, 1
);
select extensions.throws_ok(
  $$select api.service_rollback_fantasy_catalog(
    'cb500000-0000-4000-8000-000000000001', repeat('a', 64)
  )$$,
  'PT409', 'fantasy_catalog_in_use',
  'rollback still refuses while a live Fantasy team exists for the season'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_teams
   where fantasy_season_id = 'cb300000-0000-4000-8000-000000000001'),
  1,
  'the guarded rollback attempt did not remove the live team'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_leagues
   where fantasy_season_id = 'cb300000-0000-4000-8000-000000000001'),
  1,
  'the guarded rollback attempt did not remove the league'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_league_memberships
   where league_id = 'cba00000-0000-4000-8000-000000000001'),
  1,
  'the guarded rollback attempt did not remove the league membership'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_rankings
   where fantasy_season_id = 'cb300000-0000-4000-8000-000000000001'),
  1,
  'the guarded rollback attempt did not remove the ranking'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_seasons
   where id = 'cb300000-0000-4000-8000-000000000001'),
  1,
  'the guarded rollback attempt did not remove the season'
);

delete from app.fantasy_teams
where id = 'cb900000-0000-4000-8000-000000000002';

-- (a) the real fix: a season with a league, a membership and a ranking, and
-- zero teams of its own, now rolls back cleanly instead of raising a
-- foreign-key violation.
select set_config(
  'test.rollback_a',
  api.service_rollback_fantasy_catalog(
    'cb500000-0000-4000-8000-000000000001', repeat('a', 64)
  )::text,
  true
);
select extensions.is(
  current_setting('test.rollback_a')::jsonb ->> 'alreadyRolledBack',
  'false',
  'the first rollback of season A is not reported as already rolled back'
);
select extensions.is(
  current_setting('test.rollback_a')::jsonb -> 'removed' ->> 'leagues',
  '1',
  'rollback reports the one removed league'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_rankings
   where fantasy_season_id = 'cb300000-0000-4000-8000-000000000001'),
  0,
  'rollback removes all rankings scoped to the season'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_league_memberships
   where league_id = 'cba00000-0000-4000-8000-000000000001'),
  0,
  'rollback removes all memberships of the season''s leagues'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_leagues
   where fantasy_season_id = 'cb300000-0000-4000-8000-000000000001'),
  0,
  'rollback removes all leagues scoped to the season'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_seasons
   where id = 'cb300000-0000-4000-8000-000000000001'),
  0,
  'rollback removes the Fantasy season itself once leagues no longer reference it'
);
select extensions.ok(
  (select rolled_back_at is not null from app_private.fantasy_catalog_activation_runs
   where id = 'cb500000-0000-4000-8000-000000000001'),
  'rollback stamps the private activation journal'
);

-- Season B's team, its (unrelated) membership row and the audit trail around
-- it are untouched: cleanup is scoped strictly to season A.
select extensions.is(
  (select count(*)::integer from app.fantasy_teams
   where id = 'cb900000-0000-4000-8000-000000000001'),
  1,
  'season B''s team, referenced by the season-A league''s membership, is left alone'
);

-- (c) already-rolled-back short-circuit still works and changes nothing
-- further.
select set_config(
  'test.rollback_a_again',
  api.service_rollback_fantasy_catalog(
    'cb500000-0000-4000-8000-000000000001', repeat('a', 64)
  )::text,
  true
);
select extensions.is(
  current_setting('test.rollback_a_again')::jsonb ->> 'alreadyRolledBack',
  'true',
  'a repeat rollback call short-circuits as already rolled back'
);

select * from extensions.finish();
rollback;
