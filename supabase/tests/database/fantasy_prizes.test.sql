-- Fantasy prizes: winner selection, tie-breaks, the twice-per-season gameweek
-- cap, flagged/staff skips, 4-gameweek blocks, season end, mini-leagues, the
-- admin verification workflow, and what the public surface may never expose.
--
-- The season below is configured to 6 gameweeks (blocks 1-4 and 5-6) with a
-- 3-member mini-league threshold, so every tier closes inside the fixture.
--
-- Accounts (team created_at in brackets; U7 and U8 share a timestamp):
--   S  staff (platform admin)   U1 flagged    U2..U8 ordinary managers
--
-- Gameweek scores
--          S   U1   U2   U3   U4   U5   U6   U7   U8
--   GW1   95   90   80   80   70   10   10   10   10   U2 made 1 transfer
--   GW2    0    0   20  100   20   60   20   20   20
--   GW3    0    0   10  110   90   90   10   10   10   U4 1 transfer, U5 6 Wildcard transfers
--   GW4    0    0   10   10   10   10   70   70   10
--   GW5    0    0    0   40    0    0    0   50   50
--   GW6    0    0  200    0    0    0    0    0    0
begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------

insert into app.countries (id, iso_alpha2, iso_alpha3) values
  ('e7000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('e7100000-0000-4000-8000-000000000001', 'prize-test', 'Prize Test', 'PRZ', 'league',
  'e7000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('e7200000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001',
  '2089/90', '2089-08-01', '2090-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
select ('e7300000-0000-4000-8000-00000000000' || n)::uuid, 'e7200000-0000-4000-8000-000000000001',
  n, 'Round ' || n, 'completed'
from generate_series(1, 6) n;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('e7600000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001',
  'prize-test', 'Prize Test', true);
insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('e7630000-0000-4000-8000-000000000001', 'e7600000-0000-4000-8000-000000000001',
  'e7200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  '2089/90', 'active', '2089-08-01', '2090-06-30');

-- Every gameweek starts scheduled; the scenario finalizes them step by step.
insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at
)
select ('e7640000-0000-4000-8000-00000000000' || n)::uuid, 'e7630000-0000-4000-8000-000000000001',
  ('e7300000-0000-4000-8000-00000000000' || n)::uuid, n, 'Gameweek ' || n,
  timestamptz '2089-09-01T10:00:00Z' + (n - 1) * interval '7 days',
  timestamptz '2089-09-01T12:00:00Z' + (n - 1) * interval '7 days',
  timestamptz '2089-09-03T12:00:00Z' + (n - 1) * interval '7 days'
from generate_series(1, 6) n;

-- A past, completed season with one final gameweek, evaluated while every
-- prize is still switched off.
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('e7200000-0000-4000-8000-000000000002', 'e7100000-0000-4000-8000-000000000001',
  '2088/89', '2088-08-01', '2089-06-30', 'completed', false);
insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('e7630000-0000-4000-8000-000000000002', 'e7600000-0000-4000-8000-000000000001',
  'e7200000-0000-4000-8000-000000000002', 'f6100000-0000-4000-8000-000000000100',
  '2088/89', 'completed', '2088-08-01', '2089-06-30');
insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, finalized_at, points_state
) values ('e7650000-0000-4000-8000-000000000001', 'e7630000-0000-4000-8000-000000000002',
  null, 1, 'Gameweek 1', '2088-09-01T10:00:00Z', '2088-09-01T12:00:00Z', '2088-09-03T12:00:00Z',
  'finalized', '2088-09-04T12:00:00Z', 'final');

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select ('e7800000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'prize-' || i || '@example.test', statement_timestamp(), 'hash', '{}', '{}',
  statement_timestamp(), statement_timestamp()
from generate_series(1, 9) i;

update app.profiles profile set username = fixture.username, display_name = fixture.display_name
from (values
  ('e7800000-0000-4000-8000-000000000001'::uuid, 'staffer', 'Staff Person'),
  ('e7800000-0000-4000-8000-000000000002'::uuid, 'flagged_one', 'Flagged Person'),
  ('e7800000-0000-4000-8000-000000000003'::uuid, 'user_two', 'Real Name Two'),
  ('e7800000-0000-4000-8000-000000000004'::uuid, 'hamza_77', 'Real Name Three'),
  ('e7800000-0000-4000-8000-000000000005'::uuid, 'user_four', 'Real Name Four'),
  ('e7800000-0000-4000-8000-000000000006'::uuid, 'user_five', 'Real Name Five'),
  ('e7800000-0000-4000-8000-000000000007'::uuid, 'user_six', 'Real Name Six'),
  ('e7800000-0000-4000-8000-000000000008'::uuid, 'user_seven', 'Real Name Seven'),
  ('e7800000-0000-4000-8000-000000000009'::uuid, 'user_eight', 'Real Name Eight')
) as fixture(id, username, display_name)
where profile.id = fixture.id;

insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value,
  free_transfers, status, created_at
)
select ('e7900000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid,
  ('e7800000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid,
  'e7630000-0000-4000-8000-000000000001', 'e7640000-0000-4000-8000-000000000004',
  fixture.team_name, 0, 100, 1, 'active',
  timestamptz '2089-08-01T00:00:00Z' + least(i - 1, 7) * interval '1 minute'
from (values
  (1, 'Staff Eleven'), (2, 'Flagged Eleven'), (3, 'Two Eleven'), (4, 'Three Eleven'),
  (5, 'Four Eleven'), (6, 'Five Eleven'), (7, 'Six Eleven'), (8, 'Seven Eleven'), (9, 'Eight Eleven')
) as fixture(i, team_name);

-- scores[gameweek][account 1..9]
insert into app.fantasy_team_gameweek_results (
  fantasy_team_id, gameweek_id, starting_points, bench_points, captain_points, transfer_hit,
  provisional_score, final_score, state, calculation_version, finalized_at
)
select ('e7900000-0000-4000-8000-0000000000' || lpad(account::text, 2, '0'))::uuid,
  ('e7640000-0000-4000-8000-00000000000' || gameweek)::uuid,
  score, 0, 0, 0, score, score, 'final', 1, timestamptz '2089-09-04T12:00:00Z'
from (values
  (1, array[95, 90, 80, 80, 70, 10, 10, 10, 10]),
  (2, array[0, 0, 20, 100, 20, 60, 20, 20, 20]),
  (3, array[0, 0, 10, 110, 90, 90, 10, 10, 10]),
  (4, array[0, 0, 10, 10, 10, 10, 70, 70, 10]),
  (5, array[0, 0, 0, 40, 0, 0, 0, 50, 50]),
  (6, array[0, 0, 200, 0, 0, 0, 0, 0, 0])
) as scores(gameweek, points)
cross join lateral unnest(scores.points) with ordinality as cell(score, account);

insert into app.fantasy_transfer_batches (
  fantasy_team_id, gameweek_id, idempotency_key, base_team_version, resulting_team_version,
  transfers_count, free_transfers_before, free_transfers_used, point_hit, bank_before, bank_after,
  chip_type, status
) values
  ('e7900000-0000-4000-8000-000000000003', 'e7640000-0000-4000-8000-000000000001',
    gen_random_uuid(), 1, 2, 1, 1, 1, 0, 0, 0, null, 'confirmed'),
  ('e7900000-0000-4000-8000-000000000005', 'e7640000-0000-4000-8000-000000000003',
    gen_random_uuid(), 1, 2, 1, 1, 1, 0, 0, 0, null, 'confirmed'),
  ('e7900000-0000-4000-8000-000000000006', 'e7640000-0000-4000-8000-000000000003',
    gen_random_uuid(), 1, 2, 6, 1, 0, 0, 0, 0, 'wildcard', 'confirmed');

-- League A (oldest): U2 U3 U4. League B: U3 U5 U6. League C: 2 members, under
-- the threshold. League D: 3 members but archived.
insert into app.fantasy_leagues (
  id, fantasy_season_id, owner_user_id, name, visibility, invite_code_digest, invite_code_hint,
  active, member_count, created_at
) values
  ('e7a00000-0000-4000-8000-000000000001', 'e7630000-0000-4000-8000-000000000001',
    'e7800000-0000-4000-8000-000000000003', 'League A', 'private', repeat('a', 64), 'AAAA',
    true, 3, '2089-08-02T00:00:00Z'),
  ('e7a00000-0000-4000-8000-000000000002', 'e7630000-0000-4000-8000-000000000001',
    'e7800000-0000-4000-8000-000000000006', 'League B', 'private', repeat('b', 64), 'BBBB',
    true, 3, '2089-08-03T00:00:00Z'),
  ('e7a00000-0000-4000-8000-000000000003', 'e7630000-0000-4000-8000-000000000001',
    'e7800000-0000-4000-8000-000000000008', 'League C', 'public', null, null,
    true, 2, '2089-08-04T00:00:00Z'),
  ('e7a00000-0000-4000-8000-000000000004', 'e7630000-0000-4000-8000-000000000001',
    'e7800000-0000-4000-8000-000000000005', 'League D', 'public', null, null,
    false, 3, '2089-08-05T00:00:00Z');
insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id, role)
select ('e7a00000-0000-4000-8000-00000000000' || league)::uuid,
  ('e7900000-0000-4000-8000-0000000000' || lpad(account::text, 2, '0'))::uuid,
  ('e7800000-0000-4000-8000-0000000000' || lpad(account::text, 2, '0'))::uuid,
  'member'
from (values (1, 3), (1, 4), (1, 5), (2, 4), (2, 6), (2, 7), (3, 8), (3, 9), (4, 5), (4, 6), (4, 7))
  as membership(league, account);

-- S becomes the platform admin (staff), with a verified factor and an aal2
-- session; U2 gets an aal2 session but no staff principal.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('e7b00000-0000-4000-8000-000000000001', 'e7800000-0000-4000-8000-000000000001',
  'Prize TOTP', 'totp', 'verified', statement_timestamp(), statement_timestamp());
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('e7c00000-0000-4000-8000-000000000001', 'e7800000-0000-4000-8000-000000000001',
    statement_timestamp(), statement_timestamp(), 'aal2'),
  ('e7c00000-0000-4000-8000-000000000003', 'e7800000-0000-4000-8000-000000000003',
    statement_timestamp(), statement_timestamp(), 'aal2');
select extensions.lives_ok(
  $$select api.admin_bootstrap_first_platform_admin(
    'e7800000-0000-4000-8000-000000000001',
    'Bootstrap deterministic prize test platform administrator.',
    true
  )$$,
  'the prize fixture bootstraps one platform administrator'
);

insert into app_private.fantasy_prize_flags (user_id, reason, flagged_by_principal_id)
select 'e7800000-0000-4000-8000-000000000002', 'Suspected multi-accounting in fixture.', principal.id
from app_private.staff_principals principal
where principal.auth_user_id = 'e7800000-0000-4000-8000-000000000001';

insert into app.fantasy_prize_settings (fantasy_season_id, gameweek_count, mini_league_min_members)
values ('e7630000-0000-4000-8000-000000000001', 6, 3);

-- ---------------------------------------------------------------------------
-- Seed and permission
-- ---------------------------------------------------------------------------

select extensions.is(
  (select count(*)::integer from app.fantasy_prizes
   where id in ('f7a10000-0000-4000-8000-000000000001', 'f7a10000-0000-4000-8000-000000000002',
     'f7a10000-0000-4000-8000-000000000003')),
  3, 'the three default prizes are seeded'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_prizes where active), 0,
  'every default prize is seeded switched off'
);
select extensions.is(
  (select jsonb_object_agg(tier, estimated_value_mad) from app.fantasy_prizes
   where id::text like 'f7a10000-%'),
  '{"gameweek": 500, "monthly": 2500, "season": 25000}'::jsonb,
  'the default prize values are 500, 2 500 and 25 000 MAD'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_prizes
   where id::text like 'f7a10000-%' and (sponsor_name is not null or sponsor_logo_url is not null)),
  0, 'no default prize names a sponsor: that waits for a signed sponsor, set from the admin'
);
select extensions.ok(
  exists (
    select 1 from app_private.admin_role_permissions mapping
    join app_private.admin_roles role on role.id = mapping.role_id
    join app_private.admin_permissions permission on permission.id = mapping.permission_id
    where role.name = 'platform_admin' and permission.name = 'prizes.manage'
      and permission.requires_mfa and permission.requires_recent_auth
  ),
  'prizes.manage exists, needs MFA and recent auth, and platform_admin holds it'
);
select extensions.is(
  (select count(*)::integer from app_private.admin_role_permissions mapping
   join app_private.admin_permissions permission on permission.id = mapping.permission_id
   where permission.name = 'prizes.manage'),
  1, 'no role other than platform_admin holds prizes.manage'
);

-- ---------------------------------------------------------------------------
-- Pure helpers
-- ---------------------------------------------------------------------------

select extensions.is(
  (select row(block_number, first_gameweek_number, last_gameweek_number)::text
   from app_private.fantasy_prize_block_bounds(n, season_length))
  , expected, format('gameweek %s of %s sits in block %s', n, season_length, expected))
from (values
  (1, 30, '(1,1,4)'), (4, 30, '(1,1,4)'), (5, 30, '(2,5,8)'), (28, 30, '(7,25,28)'),
  (29, 30, '(8,29,30)'), (30, 30, '(8,29,30)'),
  (24, 29, '(6,21,24)'), (25, 29, '(7,25,29)'), (29, 29, '(7,25,29)'),
  (28, 28, '(7,25,28)'), (29, 31, '(8,29,31)'), (31, 31, '(8,29,31)'),
  (5, 5, '(1,1,5)'), (4, 6, '(1,1,4)'), (6, 6, '(2,5,6)'),
  (1, 1, '(1,1,1)'), (2, 2, '(1,1,2)'), (3, 3, '(1,1,3)')
) as cases(n, season_length, expected);
select extensions.throws_ok(
  $$select * from app_private.fantasy_prize_block_bounds(31, 30)$$,
  'PT400', 'validation_failed', 'a gameweek beyond the season length has no block'
);
select extensions.is(app_private.fantasy_mask_username('hamza_77'), 'h***7',
  'a username is masked to its first and last characters');
select extensions.is(app_private.fantasy_mask_username('ab'), 'a***',
  'a two-character username keeps only its first character');
select extensions.is(app_private.fantasy_mask_username(null), null,
  'no username masks to null');

-- ---------------------------------------------------------------------------
-- Declared surface
-- ---------------------------------------------------------------------------

select extensions.ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where (n.nspname, c.relname) in (
     ('app', 'fantasy_prizes'), ('app', 'fantasy_prize_settings'),
     ('app', 'fantasy_prize_winners'), ('app', 'fantasy_prize_skips'),
     ('app_private', 'fantasy_prize_flags'), ('app_private', 'fantasy_prize_evaluations'))),
  'every prize table enables and forces row level security'
);
select extensions.ok(
  not has_table_privilege('anon', 'app.fantasy_prize_winners', 'select')
  and not has_table_privilege('authenticated', 'app.fantasy_prize_winners', 'select')
  and not has_table_privilege('anon', 'app.fantasy_prizes', 'select')
  and not has_table_privilege('authenticated', 'app.fantasy_prizes', 'select')
  and not has_table_privilege('authenticated', 'app_private.fantasy_prize_flags', 'select'),
  'no client role can read a prize table directly'
);
select extensions.ok(
  has_function_privilege('anon', 'api.fantasy_prizes()', 'execute')
  and has_function_privilege('anon', 'api.fantasy_prize_winners(integer, timestamptz, uuid)', 'execute')
  and has_function_privilege('authenticated', 'api.fantasy_prizes()', 'execute'),
  'anyone may read the public prize functions'
);
select extensions.ok(
  not has_function_privilege('anon', 'api.service_evaluate_fantasy_prizes(integer)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_evaluate_fantasy_prizes(integer)', 'execute')
  and has_function_privilege('service_role', 'api.service_evaluate_fantasy_prizes(integer)', 'execute'),
  'only the trusted worker may evaluate prizes'
);
select extensions.ok(
  not has_function_privilege('anon',
    'api.admin_set_fantasy_prize_winner_status(uuid, text, text, uuid)', 'execute')
  and not has_function_privilege('anon',
    'api.admin_override_fantasy_prize_winner(uuid, uuid, text, text, uuid)', 'execute')
  and not has_function_privilege('service_role',
    'api.admin_save_fantasy_prize(uuid, text, text, text, text, text, integer, text, text, text, boolean, text, uuid)',
    'execute'),
  'admin prize functions are not callable by anon or the worker'
);
select extensions.is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   cross join lateral unnest(p.proargtypes::oid[]) as argument_type
   join pg_type t on t.oid = argument_type
   join pg_namespace tn on tn.oid = t.typnamespace
   where n.nspname = 'api' and p.proname in ('fantasy_prizes', 'fantasy_prize_winners')
     and tn.nspname <> 'pg_catalog'),
  0, 'the anonymous prize readers name no app-schema type (BG-0063 coercion trap)'
);

-- ---------------------------------------------------------------------------
-- Nothing is awarded while the prizes are switched off
-- ---------------------------------------------------------------------------

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  (api.service_evaluate_fantasy_prizes() ->> 'evaluatedCount')::integer, 1,
  'with every prize off, the past season''s final gameweek is still journaled'
);
reset role;
select extensions.is(
  (select count(*)::integer from app.fantasy_prize_winners), 0,
  'no winner exists for a tier without an active prize'
);
select extensions.is(
  (select outcome -> 'gameweek' ->> 'status' from app_private.fantasy_prize_evaluations
   where gameweek_id = 'e7650000-0000-4000-8000-000000000001'),
  'no_active_prize', 'the journal records why nothing was awarded'
);

-- Now the scenario: prizes on, GW1-3 final, GW4 open (the one in flight).
update app.fantasy_prizes set active = true where id::text like 'f7a10000-%';
insert into app.fantasy_prizes (id, tier, name_fr, name_ar, description_fr, sponsor_name, active)
values ('e7d00000-0000-4000-8000-000000000001', 'mini_league', 'Pack merchandising',
  'حزمة منتجات', 'Maillot et écharpe pour le leader de la ligue.', 'Sponsor Test', true);
update app.fantasy_gameweeks set status = 'finalized', points_state = 'final',
  finalized_at = starts_at + interval '3 days'
where fantasy_season_id = 'e7630000-0000-4000-8000-000000000001' and sequence_number <= 3;
update app.fantasy_gameweeks set status = 'open'
where fantasy_season_id = 'e7630000-0000-4000-8000-000000000001' and sequence_number = 4;

-- ---------------------------------------------------------------------------
-- GW1-3: evaluated in order, the open GW4 stops the walk
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e7800000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select api.service_evaluate_fantasy_prizes()$$,
  '42501', null, 'a signed-in manager cannot run the prize worker'
);
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('test.run_one', api.service_evaluate_fantasy_prizes()::text, true);
select extensions.is(
  (current_setting('test.run_one')::jsonb ->> 'evaluatedCount')::integer, 3,
  'the worker evaluates the three finalized gameweeks'
);
select extensions.is(
  (select jsonb_agg((item ->> 'gameweekNumber')::integer order by (item ->> 'gameweekNumber')::integer)
   from jsonb_array_elements(current_setting('test.run_one')::jsonb -> 'evaluated') item),
  '[1, 2, 3]'::jsonb, 'gameweeks are evaluated in sequence order'
);
select extensions.is(
  (current_setting('test.run_one')::jsonb ->> 'hasMore')::boolean, false,
  'the open gameweek 4 ends the walk; nothing is skipped ahead of it'
);
select extensions.is(
  (api.service_evaluate_fantasy_prizes() ->> 'evaluatedCount')::integer, 0,
  'a second run is a no-op'
);
reset role;

select extensions.is(
  (select count(*)::integer from app.fantasy_prize_winners), 3,
  'a re-run creates no duplicate winner'
);

-- GW1: S (95, staff) and U1 (90, flagged) are skipped; U3 and U2 tie on 80
-- and U3 made no transfer.
select extensions.is(
  (select row(fantasy_team_id, points, transfers_in_period, tie_break, status)::text
   from app.fantasy_prize_winners where period_key = 'gw:1'),
  row('e7900000-0000-4000-8000-000000000004'::uuid, 80, 0,
    'fewer_transfers'::app.fantasy_prize_tie_break, 'pending'::app.fantasy_prize_winner_status)::text,
  'GW1 goes to the tied manager with fewer transfers, pending verification'
);
select extensions.is(
  (select runner_up_team_id from app.fantasy_prize_winners where period_key = 'gw:1'),
  'e7900000-0000-4000-8000-000000000003'::uuid,
  'the winner row names the runner-up it was separated from'
);
select extensions.is(
  (select jsonb_object_agg(user_id, reason) from app.fantasy_prize_skips where period_key = 'gw:1'),
  jsonb_build_object(
    'e7800000-0000-4000-8000-000000000001', 'staff',
    'e7800000-0000-4000-8000-000000000002', 'flagged'),
  'the staff account and the flagged account are skipped and logged'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_prize_skips where period_key = 'gw:1'), 2,
  'only the accounts above the winner are logged as skipped'
);

-- GW2: U3 again, outright.
select extensions.is(
  (select row(fantasy_team_id, points, tie_break)::text
   from app.fantasy_prize_winners where period_key = 'gw:2'),
  row('e7900000-0000-4000-8000-000000000004'::uuid, 100,
    'outright'::app.fantasy_prize_tie_break)::text,
  'GW2 is won outright'
);

-- GW3: U3 (110) has two gameweek wins and is capped; U4 and U5 tie on 90. U5's
-- six transfers were a Wildcard and do not count, U4 made one: U5 wins,
-- although U4 registered first.
select extensions.is(
  (select row(fantasy_team_id, points, transfers_in_period, tie_break)::text
   from app.fantasy_prize_winners where period_key = 'gw:3'),
  row('e7900000-0000-4000-8000-000000000006'::uuid, 90, 0,
    'fewer_transfers'::app.fantasy_prize_tie_break)::text,
  'Wildcard transfers are not counted in the transfer tie-break'
);
select extensions.is(
  (select reason::text from app.fantasy_prize_skips
   where period_key = 'gw:3' and user_id = 'e7800000-0000-4000-8000-000000000004'),
  'gameweek_cap_reached', 'a third gameweek win in one season is skipped and logged'
);
select extensions.ok(
  not exists (select 1 from app.fantasy_prize_winners where tier = 'monthly'),
  'block 1 does not close before its fourth gameweek'
);

-- ---------------------------------------------------------------------------
-- GW4: the block closes
-- ---------------------------------------------------------------------------

update app.fantasy_gameweeks set status = 'finalized', points_state = 'final',
  finalized_at = '2089-09-25T12:00:00Z'
where id = 'e7640000-0000-4000-8000-000000000004';

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  (api.service_evaluate_fantasy_prizes() ->> 'evaluatedCount')::integer, 1,
  'finalizing GW4 makes it, and only it, evaluable'
);
reset role;

-- U6 and U7 tie on 70 with no transfers; U6 registered a minute earlier.
select extensions.is(
  (select row(fantasy_team_id, tie_break)::text from app.fantasy_prize_winners where period_key = 'gw:4'),
  row('e7900000-0000-4000-8000-000000000007'::uuid,
    'earlier_registration'::app.fantasy_prize_tie_break)::text,
  'an even tie on points and transfers goes to the earlier registration'
);
-- Block 1 = GW1-4: U3 300 (the gameweek cap does not apply to other tiers).
select extensions.is(
  (select row(fantasy_team_id, points, first_gameweek_number, last_gameweek_number, block_number, tie_break)::text
   from app.fantasy_prize_winners where tier = 'monthly'),
  row('e7900000-0000-4000-8000-000000000004'::uuid, 300, 1, 4, 1,
    'outright'::app.fantasy_prize_tie_break)::text,
  'the monthly block 1-4 goes to the highest four-gameweek total'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_prize_skips where period_key = 'block:1'), 0,
  'nobody outscored the block winner, so nobody is logged as skipped'
);
select extensions.is(
  (select prize_name_fr from app.fantasy_prize_winners where tier = 'monthly'),
  'Smartphone', 'the winner row keeps a snapshot of the prize name'
);

-- ---------------------------------------------------------------------------
-- Admin: season settings cannot move an awarded block
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e7800000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e7c00000-0000-4000-8000-000000000001"}',
  true);
select extensions.throws_ok(
  $$select api.admin_save_fantasy_prize_settings('e7630000-0000-4000-8000-000000000001', 5, 3,
    'Shorten the prize season to five.', gen_random_uuid())$$,
  'PT409', 'prize_settings_conflict', 'a length that would reshape the awarded block 1-4 is refused'
);
select extensions.throws_ok(
  $$select api.admin_save_fantasy_prize_settings('e7630000-0000-4000-8000-000000000001', 3, 3,
    'Shorten the prize season to three.', gen_random_uuid())$$,
  'PT409', 'prize_settings_conflict', 'a length shorter than the gameweeks already played is refused'
);
select extensions.is(
  (api.admin_save_fantasy_prize_settings('e7630000-0000-4000-8000-000000000001', 8, 3,
    'Lengthen the prize season to eight.', gen_random_uuid()) -> 'blocks'),
  '[{"blockNumber": 1, "firstGameweekNumber": 1, "lastGameweekNumber": 4},
    {"blockNumber": 2, "firstGameweekNumber": 5, "lastGameweekNumber": 8}]'::jsonb,
  'a length that keeps the awarded blocks intact is accepted and returns the block plan'
);
select extensions.is(
  (api.admin_save_fantasy_prize_settings('e7630000-0000-4000-8000-000000000001', 6, 3,
    'Restore the prize season to six.', gen_random_uuid()) ->> 'gameweekCount')::integer,
  6, 'the length can be set back while no later block has closed'
);
select extensions.is(
  (api.admin_get_fantasy_prize_settings() ->> 'lastEvaluatedGameweek')::integer, 4,
  'the settings read defaults to the current season and reports the last evaluated gameweek'
);
reset role;

-- ---------------------------------------------------------------------------
-- GW5-6: bounded batches, the final block, the season, the mini-leagues
-- ---------------------------------------------------------------------------

update app.fantasy_gameweeks set status = 'finalized', points_state = 'final',
  finalized_at = '2089-10-09T12:00:00Z'
where id in ('e7640000-0000-4000-8000-000000000005', 'e7640000-0000-4000-8000-000000000006');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('test.run_limited', api.service_evaluate_fantasy_prizes(1)::text, true);
select extensions.is(
  (current_setting('test.run_limited')::jsonb ->> 'evaluatedCount')::integer, 1,
  'p_limit bounds one call'
);
select extensions.is(
  (current_setting('test.run_limited')::jsonb ->> 'hasMore')::boolean, true,
  'a bounded call reports that more work remains'
);
select extensions.is(
  (api.service_evaluate_fantasy_prizes() ->> 'evaluatedCount')::integer, 1,
  'the next call finishes the season'
);
reset role;

-- GW5: U7 and U8 tie on 50 with no transfers and registered in the same
-- instant; the team id decides.
select extensions.is(
  (select row(fantasy_team_id, tie_break)::text from app.fantasy_prize_winners where period_key = 'gw:5'),
  row('e7900000-0000-4000-8000-000000000008'::uuid,
    'final_fallback'::app.fantasy_prize_tie_break)::text,
  'a complete tie falls back to the team id, deterministically'
);
select extensions.is(
  (select row(fantasy_team_id, points, first_gameweek_number, last_gameweek_number)::text
   from app.fantasy_prize_winners where period_key = 'block:2'),
  row('e7900000-0000-4000-8000-000000000003'::uuid, 200, 5, 6)::text,
  'the final block 5-6 closes with the season'
);
select extensions.is(
  (select row(fantasy_team_id, points, first_gameweek_number, last_gameweek_number, tie_break)::text
   from app.fantasy_prize_winners where tier = 'season'),
  row('e7900000-0000-4000-8000-000000000004'::uuid, 340, 1, 6,
    'outright'::app.fantasy_prize_tie_break)::text,
  'the season prize goes to the highest total after the last gameweek'
);
select extensions.is(
  (select jsonb_object_agg(league_id, fantasy_team_id) from app.fantasy_prize_winners
   where tier = 'mini_league'),
  jsonb_build_object(
    'e7a00000-0000-4000-8000-000000000001', 'e7900000-0000-4000-8000-000000000004',
    'e7a00000-0000-4000-8000-000000000002', 'e7900000-0000-4000-8000-000000000006'),
  'each qualifying league has one winner, and one person wins one mini-league at most'
);
select extensions.is(
  (select reason::text from app.fantasy_prize_skips
   where tier = 'mini_league' and league_id = 'e7a00000-0000-4000-8000-000000000002'),
  'mini_league_cap_reached',
  'the leader of a second league who already won one is skipped and logged'
);
select extensions.ok(
  not exists (select 1 from app.fantasy_prize_winners
    where league_id in ('e7a00000-0000-4000-8000-000000000003', 'e7a00000-0000-4000-8000-000000000004')),
  'a league under the member threshold and an archived league award nothing'
);
select extensions.is(
  (select prize_value_mad from app.fantasy_prize_winners where tier = 'mini_league' limit 1),
  null, 'a mini-league prize carries no cash value'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e7800000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e7c00000-0000-4000-8000-000000000001"}',
  true);
select extensions.throws_ok(
  $$select api.admin_save_fantasy_prize_settings('e7630000-0000-4000-8000-000000000001', 8, 3,
    'Lengthen a finished prize season.', gen_random_uuid())$$,
  'PT409', 'prize_settings_conflict', 'the length of a season whose end was evaluated is frozen'
);

-- ---------------------------------------------------------------------------
-- Admin: prizes
-- ---------------------------------------------------------------------------

select extensions.is(
  jsonb_array_length(api.admin_list_fantasy_prizes() -> 'items'), 4,
  'the admin list includes every prize'
);
select extensions.throws_ok(
  $$select api.admin_save_fantasy_prize(null, 'gameweek', 'Autre lot', null, '', null, 100,
    null, null, null, true, 'Add a second gameweek prize.', gen_random_uuid())$$,
  'PT409', 'prize_tier_already_active', 'two prizes of one tier cannot be active together'
);
select extensions.throws_ok(
  $$select api.admin_save_fantasy_prize(null, 'season', 'Lot', null, '', null, 100,
    null, 'http://example.test/logo.png', null, false, 'Add an insecure logo.', gen_random_uuid())$$,
  'PT400', 'prize_url_invalid', 'a non-https image URL is refused'
);
select extensions.throws_ok(
  $$select api.admin_save_fantasy_prize(null, 'mini_league', 'Lot', null, '', null, 100,
    null, null, null, false, 'Give merchandise a value.', gen_random_uuid())$$,
  'PT400', 'prize_value_invalid', 'a mini-league prize cannot carry a cash value'
);
select extensions.throws_ok(
  $$select api.admin_save_fantasy_prize('f7a10000-0000-4000-8000-000000000002', 'season',
    'Smartphone', null, '', null, 2500, null, null, null, true, 'Move the prize tier.',
    gen_random_uuid())$$,
  'PT409', 'prize_tier_immutable', 'a prize keeps its tier'
);
select extensions.throws_ok(
  $$select api.admin_save_fantasy_prize(null, 'season', 'Lot', null, '', null, 100,
    null, null, null, false, 'short', gen_random_uuid())$$,
  'PT400', 'prize_reason_invalid', 'every admin write needs a reason of at least 8 characters'
);
select set_config('test.save_key', gen_random_uuid()::text, true);
select extensions.is(
  api.admin_save_fantasy_prize('f7a10000-0000-4000-8000-000000000002', 'monthly',
    'Smartphone 5G', 'هاتف ذكي 5G', 'Un smartphone 5G.', null, 3000, 'Sponsor Test',
    'https://cdn.example.test/sponsor.png', 'https://cdn.example.test/phone.webp', true,
    'Upgrade the monthly prize.', current_setting('test.save_key')::uuid) ->> 'nameFr',
  'Smartphone 5G', 'an admin edits a prize'
);
select extensions.is(
  api.admin_save_fantasy_prize('f7a10000-0000-4000-8000-000000000002', 'monthly',
    'Smartphone 5G', 'هاتف ذكي 5G', 'Un smartphone 5G.', null, 3000, 'Sponsor Test',
    'https://cdn.example.test/sponsor.png', 'https://cdn.example.test/phone.webp', true,
    'Upgrade the monthly prize.', current_setting('test.save_key')::uuid) ->> 'estimatedValueMad',
  '3000', 'repeating the same idempotency key replays the saved result'
);
reset role;
select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events
   where action = 'prizes.save_prize' and reason = 'Upgrade the monthly prize.'),
  1, 'a replayed save is audited once'
);
select extensions.is(
  (select prize_name_fr from app.fantasy_prize_winners where tier = 'monthly' and period_key = 'block:1'),
  'Smartphone', 'editing a prize never rewrites an awarded winner'
);

-- ---------------------------------------------------------------------------
-- Admin: verification workflow
-- ---------------------------------------------------------------------------

select set_config('test.gw1_winner',
  (select id::text from app.fantasy_prize_winners where period_key = 'gw:1'), true);
select set_config('test.gw3_winner',
  (select id::text from app.fantasy_prize_winners where period_key = 'gw:3'), true);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e7800000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e7c00000-0000-4000-8000-000000000001"}',
  true);

select extensions.is(
  (select item ->> 'runnerUpUsername' from jsonb_array_elements(
     api.admin_list_fantasy_prize_winners() -> 'items') item
   where item ->> 'id' = current_setting('test.gw1_winner')),
  'user_two', 'the admin list names the runner-up, a ready replacement'
);
select extensions.is(
  (select item ->> 'email' from jsonb_array_elements(
     api.admin_list_fantasy_prize_winners() -> 'items') item
   where item ->> 'id' = current_setting('test.gw1_winner')),
  'prize-4@example.test', 'the admin list carries the winner contact email'
);
select extensions.is(
  (select jsonb_array_length(item -> 'skipped') from jsonb_array_elements(
     api.admin_list_fantasy_prize_winners() -> 'items') item
   where item ->> 'id' = current_setting('test.gw1_winner')),
  2, 'the admin list shows who was skipped before each winner'
);
select extensions.is(
  jsonb_array_length(api.admin_list_fantasy_prize_winners('pending', 2) -> 'items'), 2,
  'the admin list filters by status and pages'
);
select extensions.throws_ok(
  format($$select api.admin_set_fantasy_prize_winner_status(%L, 'paid',
    'Paid without verification.', gen_random_uuid())$$, current_setting('test.gw1_winner')),
  'PT409', 'prize_winner_transition_invalid', 'a pending winner cannot be marked paid'
);
select extensions.is(
  api.admin_set_fantasy_prize_winner_status(current_setting('test.gw1_winner')::uuid, 'verified',
    'ID card checked by phone.', gen_random_uuid()) ->> 'status',
  'verified', 'an admin verifies a winner'
);
select extensions.is(
  api.admin_set_fantasy_prize_winner_status(current_setting('test.gw1_winner')::uuid, 'paid',
    'Recharge sent and shirt delivered.', gen_random_uuid()) ->> 'status',
  'paid', 'a verified winner can be marked paid'
);
select extensions.throws_ok(
  format($$select api.admin_set_fantasy_prize_winner_status(%L, 'forfeited',
    'Too late to forfeit this.', gen_random_uuid())$$, current_setting('test.gw1_winner')),
  'PT409', 'prize_winner_transition_invalid', 'a paid winner cannot be forfeited'
);
select extensions.ok(
  (api.admin_add_fantasy_prize_winner_note(current_setting('test.gw1_winner')::uuid,
    'Winner shared a photo with the shirt.', gen_random_uuid()) ->> 'verificationNotes')
    like '%verified: ID card checked by phone.%paid: Recharge sent and shirt delivered.%note: Winner shared a photo with the shirt.',
  'status changes and notes are appended to the verification notes in order'
);
select extensions.throws_ok(
  format($$select api.admin_override_fantasy_prize_winner(%L,
    'e7900000-0000-4000-8000-000000000005', null, 'Paid prize data error.', gen_random_uuid())$$,
    current_setting('test.gw1_winner')),
  'PT409', 'prize_winner_not_overridable', 'a paid prize cannot be overridden'
);

-- Override the GW3 winner (U5) with U4.
select extensions.throws_ok(
  format($$select api.admin_override_fantasy_prize_winner(%L,
    'e7900000-0000-4000-8000-000000000005', null, 'short', gen_random_uuid())$$,
    current_setting('test.gw3_winner')),
  'PT400', 'prize_reason_invalid', 'an override without a real reason is refused'
);
select extensions.throws_ok(
  format($$select api.admin_override_fantasy_prize_winner(%L,
    null, 'flagged_one', 'Award to the flagged account.', gen_random_uuid())$$,
    current_setting('test.gw3_winner')),
  'PT409', 'prize_override_team_ineligible', 'an override cannot pick a flagged account'
);
select extensions.throws_ok(
  format($$select api.admin_override_fantasy_prize_winner(%L,
    'e7900000-0000-4000-8000-000000000006', null, 'Award to the same team.', gen_random_uuid())$$,
    current_setting('test.gw3_winner')),
  'PT400', 'prize_override_same_team', 'an override must pick a different team'
);
select extensions.throws_ok(
  format($$select api.admin_override_fantasy_prize_winner(%L,
    'e7900000-0000-4000-8000-000000000005', 'user_four', 'Name the team twice.', gen_random_uuid())$$,
    current_setting('test.gw3_winner')),
  'PT400', 'validation_failed', 'an override names its replacement exactly once'
);
select extensions.throws_ok(
  format($$select api.admin_override_fantasy_prize_winner(%L,
    null, 'nobody_here', 'Award to an unknown account.', gen_random_uuid())$$,
    current_setting('test.gw3_winner')),
  'PT404', 'prize_override_team_not_found', 'an unknown replacement username is reported'
);
select set_config('test.override', api.admin_override_fantasy_prize_winner(
  current_setting('test.gw3_winner')::uuid, null, 'USER_FOUR',
  'Provider corrected GW3 statistics after finalization.', gen_random_uuid())::text, true);
select extensions.is(
  current_setting('test.override')::jsonb ->> 'fantasyTeamId', 'e7900000-0000-4000-8000-000000000005',
  'the replacement is resolved from its owner''s username, case-insensitively'
);
select extensions.is(
  current_setting('test.override')::jsonb ->> 'status', 'pending',
  'the replacement winner starts pending'
);
select extensions.is(
  current_setting('test.override')::jsonb ->> 'tieBreak', 'admin_override',
  'the replacement records that an admin chose it'
);
select extensions.is(
  (current_setting('test.override')::jsonb ->> 'points')::integer, 90,
  'the replacement carries its own points for the period'
);
reset role;

select extensions.is(
  (select row(status, superseded_by_winner_id::text)::text from app.fantasy_prize_winners
   where id = current_setting('test.gw3_winner')::uuid),
  row('overridden'::app.fantasy_prize_winner_status, current_setting('test.override')::jsonb ->> 'id')::text,
  'the replaced row is kept, marked overridden and linked to its replacement'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_prize_winners where period_key = 'gw:3' and status <> 'overridden'),
  1, 'a period still has exactly one live winner after an override'
);
select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events
   where action = 'prizes.override_winner'
     and reason = 'Provider corrected GW3 statistics after finalization.'
     and target_entity_id = current_setting('test.gw3_winner')::uuid),
  1, 'the override and its reason are in the admin audit log'
);

-- ---------------------------------------------------------------------------
-- Admin: flags
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e7800000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"e7c00000-0000-4000-8000-000000000001"}',
  true);
select extensions.is(
  api.admin_set_fantasy_prize_flag(null, 'USER_EIGHT', true, 'Shares a device with a winner.',
    gen_random_uuid()) ->> 'flagged',
  'true', 'an admin flags an account by username, case-insensitively'
);
select extensions.is(
  (select jsonb_agg(item ->> 'username' order by item ->> 'username')
   from jsonb_array_elements(api.admin_list_fantasy_prize_flags() -> 'items') item),
  '["flagged_one", "user_eight"]'::jsonb, 'the flag list shows every flagged account'
);
select extensions.is(
  api.admin_set_fantasy_prize_flag('e7800000-0000-4000-8000-000000000009', null, false,
    'Device check cleared the account.', gen_random_uuid()) ->> 'flagged',
  'false', 'an admin clears a flag'
);
select extensions.throws_ok(
  $$select api.admin_set_fantasy_prize_flag(null, 'nobody_here', true,
    'Flag an unknown account.', gen_random_uuid())$$,
  'PT404', 'prize_account_not_found', 'an unknown username is reported'
);
reset role;

-- ---------------------------------------------------------------------------
-- Admin gates
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e7800000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2","session_id":"e7c00000-0000-4000-8000-000000000003"}',
  true);
select extensions.throws_ok(
  $$select api.admin_list_fantasy_prize_winners()$$,
  'PT403', 'staff_access_denied', 'a manager who is not staff cannot read the winner queue'
);
select extensions.throws_ok(
  format($$select api.admin_set_fantasy_prize_winner_status(%L, 'verified',
    'Self-verification attempt.', gen_random_uuid())$$,
    current_setting('test.override')::jsonb ->> 'id'),
  'PT403', 'staff_access_denied', 'a manager who is not staff cannot verify a winner'
);
select set_config('request.jwt.claims',
  '{"sub":"e7800000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"e7c00000-0000-4000-8000-000000000001"}',
  true);
select extensions.throws_ok(
  $$select api.admin_list_fantasy_prizes()$$,
  'PT403', 'mfa_assurance_insufficient', 'the admin surface requires a second factor'
);
reset role;

-- ---------------------------------------------------------------------------
-- Public reads
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  (select jsonb_agg(item ->> 'tier') from jsonb_array_elements(api.fantasy_prizes() -> 'items') item),
  '["gameweek", "monthly", "season", "mini_league"]'::jsonb,
  'the public catalog lists the active prizes in tier order'
);
select extensions.is(
  (select array_agg(key order by key) from jsonb_object_keys(api.fantasy_prizes() -> 'items' -> 0) key),
  array['description', 'estimatedValueMad', 'id', 'imageUrl', 'name', 'sponsorLogoUrl',
    'sponsorName', 'tier'],
  'a public prize carries catalog fields only'
);
select extensions.is(
  (select item -> 'estimatedValueMad' from jsonb_array_elements(api.fantasy_prizes() -> 'items') item
   where item ->> 'tier' = 'mini_league'),
  'null'::jsonb, 'the mini-league prize shows no value'
);
select extensions.is(
  api.fantasy_prizes() -> 'items' -> 1 -> 'name',
  '{"fr": "Smartphone 5G", "ar": "هاتف ذكي 5G"}'::jsonb,
  'prize names come in French and Arabic'
);
-- Only the GW1 winner is verified (and paid) so far.
select extensions.is(
  jsonb_array_length(api.fantasy_prize_winners() -> 'items'), 1,
  'the winners wall shows verified or paid winners only'
);
select extensions.is(
  (select array_agg(key order by key) from jsonb_object_keys(api.fantasy_prize_winners() -> 'items' -> 0) key),
  array['awardedAt', 'blockNumber', 'firstGameweekNumber', 'id', 'lastGameweekNumber',
    'maskedUsername', 'points', 'prizeName', 'seasonName', 'teamName', 'tieBreak', 'tier'],
  'a public winner carries no email, display name, user id or note'
);
select extensions.is(
  api.fantasy_prize_winners() -> 'items' -> 0 ->> 'maskedUsername', 'h***7',
  'the winners wall masks the username'
);
select extensions.is(
  api.fantasy_prize_winners() -> 'items' -> 0 ->> 'teamName', 'Three Eleven',
  'the winners wall shows the team name'
);
select extensions.ok(
  api.fantasy_prize_winners()::text not like '%Real Name%'
  and api.fantasy_prize_winners()::text not like '%@example.test%'
  and api.fantasy_prize_winners()::text not like '%e7800000%'
  and api.fantasy_prize_winners()::text not like '%ID card%',
  'no real name, email, user id or verification note reaches an anonymous reader'
);
select extensions.throws_ok(
  $$select api.fantasy_prize_winners(0)$$, 'PT400', 'validation_failed',
  'a page size below 1 is refused'
);
select extensions.throws_ok(
  $$select api.fantasy_prize_winners(10, now(), null)$$, 'PT400', 'validation_failed',
  'half a cursor is refused'
);
select extensions.throws_ok(
  $$select api.admin_list_fantasy_prizes()$$, '42501', null,
  'an anonymous caller cannot reach the admin surface'
);
reset role;

-- Mini-league winners stay off the public wall even when verified.
update app.fantasy_prize_winners set status = 'verified', verified_at = statement_timestamp()
where tier = 'mini_league';
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.ok(
  not exists (select 1 from jsonb_array_elements(api.fantasy_prize_winners() -> 'items') item
    where item ->> 'tier' = 'mini_league'),
  'private league winners never appear on the public wall'
);
reset role;

select * from extensions.finish();

rollback;
