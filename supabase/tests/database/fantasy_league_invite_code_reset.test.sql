-- api.reset_fantasy_league_invite_code.
--
-- A private league's invite code is stored only as a digest, so the owner sees
-- the plaintext once. This function is the way back when that one sight was
-- lost: it replaces the code and returns the new one once. These assertions pin
-- what a later change could silently break:
--
--   1. surface  -- uuid/uuid signature, security definer, empty search_path,
--                  executable by authenticated and never by anon;
--   2. swap     -- the new code is minted like create's, the stored digest and
--                  hint follow it, the old code stops working and the new one
--                  joins, and the league reader shows the new hint;
--   3. refusals -- a member, a non-member, someone else's team, a public
--                  league, an archived league and an unknown id are all
--                  refused, with the league left untouched;
--   4. records  -- existing members stay, and the audit row names the league
--                  and never carries the code.
--
-- The league is created through api.create_fantasy_league and joined through
-- api.join_fantasy_league rather than inserted by hand, so the test proves the
-- new code is interchangeable with a real one, not just with a fixture.
begin;

select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('ec0de000-0000-4000-8000-000000000001', 'QI', 'QIC');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('ec0de000-0000-4000-8000-000000000002', 'invite-reset-test', 'Invite Reset Test',
  'IRT', 'league', 'ec0de000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status)
values ('ec0de000-0000-4000-8000-000000000003', 'ec0de000-0000-4000-8000-000000000002',
  '2091/92', '2091-08-01', '2092-06-30', 'active');
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('ec0de000-0000-4000-8000-000000000004', 'ec0de000-0000-4000-8000-000000000002',
  'invite-reset-test', 'Invite Reset Test', true);
insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('ec0de000-0000-4000-8000-000000000005', 'ec0de000-0000-4000-8000-000000000004',
  'ec0de000-0000-4000-8000-000000000003', 'f6100000-0000-4000-8000-000000000100',
  '2091/92', 'active', '2091-08-01', '2092-06-30');

-- Four managers: 1 owns the leagues, 2 joins with the original code, 3 joins
-- with the new one, and 4 never joins anything.
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select ('ec0de000-0000-4000-8000-00000000001' || i)::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'invite-reset-' || i || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'invite_reset_' || i), statement_timestamp(),
  statement_timestamp()
from generate_series(1, 4) i;

insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, name, bank, team_value, free_transfers, status
)
select ('ec0de000-0000-4000-8000-00000000002' || i)::uuid,
  ('ec0de000-0000-4000-8000-00000000001' || i)::uuid,
  'ec0de000-0000-4000-8000-000000000005', 'Invite Team ' || i, 0, 100, 1, 'active'
from generate_series(1, 4) i;

-- ---------------------------------------------------------------------------
-- 1. Surface
-- ---------------------------------------------------------------------------

select extensions.is(
  (select pg_get_function_identity_arguments(procedure.oid)
     from pg_proc procedure
     join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'api' and procedure.proname = 'reset_fantasy_league_invite_code'),
  'p_league_id uuid, p_team_id uuid',
  'the signature is uuid/uuid only, so no caller needs USAGE on schema app'
);
select extensions.ok(
  (select procedure.prosecdef and procedure.proconfig = array['search_path=""']
     from pg_proc procedure
     join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'api' and procedure.proname = 'reset_fantasy_league_invite_code'),
  'the function is security definer with an empty search_path'
);
select extensions.ok(
  not has_function_privilege('anon', 'api.reset_fantasy_league_invite_code(uuid,uuid)', 'execute'),
  'anon cannot execute the reset'
);
select extensions.ok(
  has_function_privilege('authenticated', 'api.reset_fantasy_league_invite_code(uuid,uuid)', 'execute'),
  'authenticated can reach the ownership-enforcing reset'
);

-- ---------------------------------------------------------------------------
-- The owner creates three leagues through the real API: the private one under
-- test, a public one and a private one that is then archived.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ec0de000-0000-4000-8000-000000000011","role":"authenticated"}', true);

select set_config('invite_test.league_id', created ->> 'leagueId', true),
  set_config('invite_test.original_code', created ->> 'inviteCode', true)
from (
  select api.create_fantasy_league('ec0de000-0000-4000-8000-000000000005',
    'ec0de000-0000-4000-8000-000000000021', 'Invite Reset League', 'private',
    gen_random_uuid()) as created
) league;

select set_config('invite_test.public_league_id',
  api.create_fantasy_league('ec0de000-0000-4000-8000-000000000005',
    'ec0de000-0000-4000-8000-000000000021', 'Invite Reset Public', 'public',
    gen_random_uuid()) ->> 'leagueId', true);

select set_config('invite_test.archived_league_id',
  api.create_fantasy_league('ec0de000-0000-4000-8000-000000000005',
    'ec0de000-0000-4000-8000-000000000021', 'Invite Reset Archived', 'private',
    gen_random_uuid()) ->> 'leagueId', true);
select extensions.ok(
  api.archive_fantasy_league(current_setting('invite_test.archived_league_id')::uuid,
    'ec0de000-0000-4000-8000-000000000021'),
  'fixture: the third league is archived by its owner'
);

-- Manager 2 joins with the code the owner saw at creation.
select set_config('request.jwt.claims',
  '{"sub":"ec0de000-0000-4000-8000-000000000012","role":"authenticated"}', true);
select extensions.is(
  api.join_fantasy_league('ec0de000-0000-4000-8000-000000000022',
    current_setting('invite_test.original_code'), gen_random_uuid()) ->> 'joined',
  'true',
  'fixture: manager 2 joins with the original code'
);

reset role;

-- ---------------------------------------------------------------------------
-- 2. The swap
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ec0de000-0000-4000-8000-000000000011","role":"authenticated"}', true);

select set_config('invite_test.response', api.reset_fantasy_league_invite_code(
  current_setting('invite_test.league_id')::uuid,
  'ec0de000-0000-4000-8000-000000000021')::text, true);
select set_config('invite_test.new_code',
  current_setting('invite_test.response')::jsonb ->> 'inviteCode', true);

select extensions.is(
  (select array_agg(key order by key)
     from jsonb_object_keys(current_setting('invite_test.response')::jsonb) as key),
  array['inviteCode', 'leagueId'],
  'the response carries the league id and the new code, nothing else'
);
select extensions.is(
  current_setting('invite_test.response')::jsonb ->> 'leagueId',
  current_setting('invite_test.league_id'),
  'the response names the league that was reset'
);
select extensions.ok(
  current_setting('invite_test.new_code') ~ '^[0-9A-F]{32}$',
  'the new code has the shape api.create_fantasy_league mints'
);
select extensions.isnt(
  current_setting('invite_test.new_code'),
  current_setting('invite_test.original_code'),
  'the new code is not the old one'
);

-- The league reader, which the league page uses, now shows the new hint.
select extensions.is(
  (select item ->> 'inviteCodeHint'
     from jsonb_array_elements(api.fantasy_leagues(
       'ec0de000-0000-4000-8000-000000000005', 'private') -> 'items') as item
    where item ->> 'id' = current_setting('invite_test.league_id')),
  right(current_setting('invite_test.new_code'), 4),
  'the owner''s league list shows the last four characters of the new code'
);

reset role;

select extensions.is(
  (select invite_code_digest from app.fantasy_leagues
    where id = current_setting('invite_test.league_id')::uuid),
  encode(extensions.digest(convert_to(current_setting('invite_test.new_code'), 'UTF8'),
    'sha256'), 'hex'),
  'the stored digest is the SHA-256 of the new code'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_leagues
    where invite_code_digest = encode(extensions.digest(
      convert_to(current_setting('invite_test.original_code'), 'UTF8'), 'sha256'), 'hex')),
  0,
  'no league matches the old code any more'
);

-- Manager 3 was handed the old code: it is refused. The new one lets them in.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ec0de000-0000-4000-8000-000000000013","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select api.join_fantasy_league('ec0de000-0000-4000-8000-000000000023',
    current_setting('invite_test.original_code'), gen_random_uuid())$$,
  'PT404', 'invite_code_invalid',
  'the old code no longer joins the league'
);
select extensions.is(
  api.join_fantasy_league('ec0de000-0000-4000-8000-000000000023',
    lower(current_setting('invite_test.new_code')), gen_random_uuid()) ->> 'leagueId',
  current_setting('invite_test.league_id'),
  'the new code joins the league, typed in any case like the original'
);

-- ---------------------------------------------------------------------------
-- 3. Refusals
-- ---------------------------------------------------------------------------

-- Manager 3 is now an active member, but not the owner.
select extensions.throws_ok(
  $$select api.reset_fantasy_league_invite_code(
    current_setting('invite_test.league_id')::uuid, 'ec0de000-0000-4000-8000-000000000023')$$,
  'PT403', 'league_access_denied',
  'a member who is not the owner cannot reset the code'
);

-- Manager 4 never joined.
select set_config('request.jwt.claims',
  '{"sub":"ec0de000-0000-4000-8000-000000000014","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select api.reset_fantasy_league_invite_code(
    current_setting('invite_test.league_id')::uuid, 'ec0de000-0000-4000-8000-000000000024')$$,
  'PT403', 'league_access_denied',
  'a manager outside the league cannot reset the code'
);

-- The owner again, on every league shape the reset must refuse.
select set_config('request.jwt.claims',
  '{"sub":"ec0de000-0000-4000-8000-000000000011","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select api.reset_fantasy_league_invite_code(
    current_setting('invite_test.league_id')::uuid, 'ec0de000-0000-4000-8000-000000000022')$$,
  'PT404', 'fantasy_team_not_found',
  'the owner cannot act through another manager''s team'
);
select extensions.throws_ok(
  $$select api.reset_fantasy_league_invite_code(
    current_setting('invite_test.public_league_id')::uuid, 'ec0de000-0000-4000-8000-000000000021')$$,
  'PT403', 'league_access_denied',
  'a public league has no code to reset'
);
select extensions.throws_ok(
  $$select api.reset_fantasy_league_invite_code(
    current_setting('invite_test.archived_league_id')::uuid, 'ec0de000-0000-4000-8000-000000000021')$$,
  'PT403', 'league_access_denied',
  'an archived league cannot get a new code'
);
select extensions.throws_ok(
  $$select api.reset_fantasy_league_invite_code(
    'ec0de000-0000-4000-8000-0000000000ff', 'ec0de000-0000-4000-8000-000000000021')$$,
  'PT403', 'league_access_denied',
  'an unknown league id gets the same answer, so existence is not revealed'
);

reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select api.reset_fantasy_league_invite_code(
    current_setting('invite_test.league_id')::uuid, 'ec0de000-0000-4000-8000-000000000021')$$,
  '42501', null,
  'an anonymous caller is refused before the body runs'
);
reset role;

select extensions.is(
  (select invite_code_digest from app.fantasy_leagues
    where id = current_setting('invite_test.league_id')::uuid),
  encode(extensions.digest(convert_to(current_setting('invite_test.new_code'), 'UTF8'),
    'sha256'), 'hex'),
  'no refused call changed the league''s code'
);
select extensions.ok(
  (select invite_code_digest is null and invite_code_hint is null from app.fantasy_leagues
    where id = current_setting('invite_test.public_league_id')::uuid),
  'the public league still has no code'
);

-- ---------------------------------------------------------------------------
-- 4. Members and the audit trail
-- ---------------------------------------------------------------------------

select extensions.is(
  (select array_agg(fantasy_team_id::text order by fantasy_team_id)
     from app.fantasy_league_memberships
    where league_id = current_setting('invite_test.league_id')::uuid and status = 'active'),
  array['ec0de000-0000-4000-8000-000000000021', 'ec0de000-0000-4000-8000-000000000022',
    'ec0de000-0000-4000-8000-000000000023'],
  'the owner, the member who used the old code and the newcomer are all active'
);
select extensions.is(
  (select member_count from app.fantasy_leagues
    where id = current_setting('invite_test.league_id')::uuid),
  3,
  'the member count is untouched by the reset'
);
select extensions.is(
  (select array_agg(safe_metadata) from app_private.fantasy_mutation_audit
    where operation = 'reset_league_invite_code'),
  array[jsonb_build_object('leagueId', current_setting('invite_test.league_id'))],
  'exactly one audit row, for the one accepted reset, naming only the league'
);
select extensions.ok(
  (select bool_and(accepted and fantasy_team_id = 'ec0de000-0000-4000-8000-000000000021'
      and user_id = 'ec0de000-0000-4000-8000-000000000011')
     from app_private.fantasy_mutation_audit
    where operation = 'reset_league_invite_code'),
  'the audit row is attributed to the owner and their team'
);

select * from extensions.finish();

rollback;
