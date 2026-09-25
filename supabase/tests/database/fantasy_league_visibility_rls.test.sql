-- The direct-table policies on Fantasy leagues
-- (20260925180200_fantasy_league_visibility_policy.sql, audit A14 / DB-06).
--
-- Browser roles have no SELECT on app.fantasy_leagues or
-- app.fantasy_league_memberships in production. League reads go through
-- api.* SECURITY DEFINER functions. The policies are defence in depth, so
-- this file grants SELECT to the browser roles inside its own transaction,
-- which rolls back, and checks what each account would see.
--
-- Before 20260925180200 every read below failed: the leagues policy compared
-- membership.league_id with membership.id, and the two policies read each
-- other's tables, so PostgreSQL stopped with 42P17 (infinite recursion).
begin;
select extensions.plan(28);

create function pg_temp.pid(n integer) returns uuid language sql immutable as $$
  select ('a1400000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated","aal":"aal1"}', p_id), true)
$$;
create function pg_temp.digest(p_code text) returns text language sql immutable as $$
  select encode(extensions.digest(convert_to(p_code, 'UTF8'), 'sha256'), 'hex')
$$;
-- The leagues the current role can see through the policy, as sorted ids.
create function pg_temp.visible_leagues() returns uuid[] language sql as $$
  select coalesce(array_agg(id order by id), '{}') from app.fantasy_leagues
  where id between pg_temp.pid(50) and pg_temp.pid(59)
$$;
create function pg_temp.visible_memberships() returns uuid[] language sql as $$
  select coalesce(array_agg(id order by id), '{}') from app.fantasy_league_memberships
  where id between pg_temp.pid(60) and pg_temp.pid(69)
$$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.pid(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.pid(2), 'league-visibility-test', 'League Visibility Test', 'LVT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.pid(3), pg_temp.pid(2), 'Current', current_date - 60, current_date + 300, 'active', true);
insert into app.rounds (id, season_id, round_number, name)
values (pg_temp.pid(11), pg_temp.pid(3), 1, 'Journée 1');
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.pid(40), pg_temp.pid(2), 'league-visibility-test', 'League Visibility Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name,
  status, starts_at, ends_at)
values (pg_temp.pid(41), pg_temp.pid(40), pg_temp.pid(3), 'f6100000-0000-4000-8000-000000000100',
  'Current Fantasy', 'active', current_date - 60, current_date + 300);
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status)
values (pg_temp.pid(42), pg_temp.pid(41), pg_temp.pid(11), 1, 'GW1',
  statement_timestamp() + interval '22 hours', statement_timestamp() + interval '1 day',
  statement_timestamp() + interval '3 days', 'open');

-- Accounts: 21 Amina (member of her private league), 22 Badr (member of
-- nothing), 23 Chaima (left Amina's league), 24 Driss (owns a private league
-- and a public one).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.pid(20 + n), '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'league-visibility-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'league_visibility_' || n, 'display_name', 'Visibility ' || n),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 4) n;

insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank,
  team_value, free_transfers)
values
  (pg_temp.pid(31), pg_temp.pid(21), pg_temp.pid(41), pg_temp.pid(42), 'Team Amina', 0, 100, 1),
  (pg_temp.pid(33), pg_temp.pid(23), pg_temp.pid(41), pg_temp.pid(42), 'Team Chaima', 0, 100, 1),
  (pg_temp.pid(34), pg_temp.pid(24), pg_temp.pid(41), pg_temp.pid(42), 'Team Driss', 0, 100, 1);

-- 51 Amina's private league, 52 Driss's private league, 53 Driss's public one.
insert into app.fantasy_leagues (id, fantasy_season_id, owner_user_id, name, visibility,
  invite_code_digest, invite_code_hint, member_count)
values
  (pg_temp.pid(51), pg_temp.pid(41), pg_temp.pid(21), 'Amina Private', 'private',
    pg_temp.digest('A1400000A1400000A1400000A1400051'), '0051', 1),
  (pg_temp.pid(52), pg_temp.pid(41), pg_temp.pid(24), 'Driss Private', 'private',
    pg_temp.digest('A1400000A1400000A1400000A1400052'), '0052', 1),
  (pg_temp.pid(53), pg_temp.pid(41), pg_temp.pid(24), 'Driss Public', 'public', null, null, 1);
insert into app.fantasy_league_memberships (id, league_id, fantasy_team_id, user_id, role, status,
  left_at)
values
  (pg_temp.pid(61), pg_temp.pid(51), pg_temp.pid(31), pg_temp.pid(21), 'owner', 'active', null),
  (pg_temp.pid(62), pg_temp.pid(51), pg_temp.pid(33), pg_temp.pid(23), 'member', 'left',
    statement_timestamp()),
  (pg_temp.pid(63), pg_temp.pid(52), pg_temp.pid(34), pg_temp.pid(24), 'owner', 'active', null),
  (pg_temp.pid(64), pg_temp.pid(53), pg_temp.pid(34), pg_temp.pid(24), 'owner', 'active', null);

-- ---------------------------------------------------------------------------
-- Shape: the policy, the helper and the production posture
-- ---------------------------------------------------------------------------
select extensions.is(
  (select array[permissive, cmd, roles::text] from pg_policies
   where schemaname = 'app' and tablename = 'fantasy_leagues'
     and policyname = 'fantasy_leagues_visible_select'),
  array['PERMISSIVE', 'SELECT', '{authenticated}'],
  'the league policy keeps its name, command and role'
);
select extensions.ok(
  (select qual like '%app_private.fantasy_is_active_league_member(id)%'
     and qual not like '%membership.id%'
   from pg_policies
   where schemaname = 'app' and tablename = 'fantasy_leagues'
     and policyname = 'fantasy_leagues_visible_select'),
  'the league policy asks about the league row itself, not membership.id'
);
select extensions.ok(
  not exists (
    select 1 from pg_policies,
      lateral regexp_matches(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
        '\m(\w+)\.(\w+) = \1\.(\w+)\M', 'g') as same_alias
  ),
  'no policy anywhere compares two columns of the same alias'
);
select extensions.ok(
  (select prosecdef and proconfig @> array['search_path=""'] and provolatile = 's'
   from pg_proc where oid = 'app_private.fantasy_is_active_league_member(uuid)'::regprocedure),
  'the helper is a stable SECURITY DEFINER function with an empty search_path'
);
select extensions.ok(
  has_function_privilege('authenticated', 'app_private.fantasy_is_active_league_member(uuid)', 'execute')
    and not has_function_privilege('anon', 'app_private.fantasy_is_active_league_member(uuid)', 'execute')
    and not has_function_privilege('service_role', 'app_private.fantasy_is_active_league_member(uuid)', 'execute')
    and not exists (
      select 1 from pg_proc, lateral aclexplode(proacl) acl
      where oid = 'app_private.fantasy_is_active_league_member(uuid)'::regprocedure
        and acl.grantee = 0
    ),
  'only authenticated, for whom the policy exists, may execute the helper'
);
select extensions.ok(
  not has_schema_privilege('authenticated', 'app_private', 'usage')
    and not has_schema_privilege('anon', 'app_private', 'usage'),
  'browser roles still have no USAGE on app_private'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'app.fantasy_leagues', 'select')
    and not has_table_privilege('anon', 'app.fantasy_leagues', 'select')
    and not has_table_privilege('authenticated', 'app.fantasy_league_memberships', 'select')
    and not has_table_privilege('anon', 'app.fantasy_league_memberships', 'select'),
  'the production posture is unchanged: no browser SELECT on either table'
);

set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));
select extensions.throws_ok(
  $$select count(*) from app.fantasy_leagues$$,
  '42501', null,
  'without a grant a direct read is refused for privileges, no longer for recursion'
);
select extensions.throws_ok(
  $$select app_private.fantasy_is_active_league_member('a1400000-0000-4000-8000-000000000051')$$,
  '42501', null,
  'authenticated cannot call the helper by name: only the policy can'
);
reset role;

-- From here on, inside this transaction only, both browser roles may read
-- both tables, so the policies decide.
grant select on app.fantasy_leagues, app.fantasy_league_memberships to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Leagues, account by account
-- ---------------------------------------------------------------------------
set local role authenticated;

select pg_temp.as_user(pg_temp.pid(21));
select extensions.lives_ok(
  $$select count(*) from app.fantasy_leagues$$,
  'Amina can read leagues: the two policies no longer recurse'
);
select extensions.is(
  pg_temp.visible_leagues(), array[pg_temp.pid(51), pg_temp.pid(53)],
  'Amina sees her private league and the public one, not Driss''s private league'
);

select pg_temp.as_user(pg_temp.pid(22));
select extensions.is(
  (select count(*)::integer from app.fantasy_leagues where id = pg_temp.pid(51)), 0,
  'Badr, who is not a member, does not see Amina''s private league'
);
select extensions.is(
  pg_temp.visible_leagues(), array[pg_temp.pid(53)],
  'Badr sees only the public league'
);

select pg_temp.as_user(pg_temp.pid(23));
select extensions.is(
  pg_temp.visible_leagues(), array[pg_temp.pid(53)],
  'Chaima, who left Amina''s league, no longer sees it'
);

select pg_temp.as_user(pg_temp.pid(24));
select extensions.is(
  pg_temp.visible_leagues(), array[pg_temp.pid(52), pg_temp.pid(53)],
  'Driss sees his private league and his public league, not Amina''s'
);

-- A membership gained or lost shows at once.
reset role;
update app.fantasy_league_memberships
set status = 'left', left_at = statement_timestamp()
where id = pg_temp.pid(61);
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));
select extensions.is(
  pg_temp.visible_leagues(), array[pg_temp.pid(53)],
  'once Amina leaves her private league she no longer sees it'
);
reset role;
update app.fantasy_league_memberships
set status = 'active', left_at = null
where id = pg_temp.pid(61);
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));
select extensions.is(
  pg_temp.visible_leagues(), array[pg_temp.pid(51), pg_temp.pid(53)],
  'and sees it again once her membership is active'
);

-- The helper answers only for the caller.
select pg_temp.as_user(pg_temp.pid(22));
reset role;
select extensions.is(
  app_private.fantasy_is_active_league_member(pg_temp.pid(51)), false,
  'the helper says no for a caller who is not a member'
);
select pg_temp.as_user(pg_temp.pid(21));
select extensions.is(
  app_private.fantasy_is_active_league_member(pg_temp.pid(51)), true,
  'the helper says yes for the caller''s own active membership'
);
select extensions.is(
  app_private.fantasy_is_active_league_member(pg_temp.pid(52)), false,
  'the helper says no for another account''s league'
);
select set_config('request.jwt.claims', '', true);
select extensions.is(
  app_private.fantasy_is_active_league_member(pg_temp.pid(51)), false,
  'the helper says no when there is no caller'
);

-- ---------------------------------------------------------------------------
-- Memberships: the other policy, unchanged, now evaluates
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));
select extensions.is(
  pg_temp.visible_memberships(), array[pg_temp.pid(61), pg_temp.pid(64)],
  'Amina sees her own membership and the public league''s, not Chaima''s or Driss''s private one'
);
select pg_temp.as_user(pg_temp.pid(22));
select extensions.is(
  pg_temp.visible_memberships(), array[pg_temp.pid(64)],
  'Badr sees only the public league''s membership'
);
select pg_temp.as_user(pg_temp.pid(23));
select extensions.is(
  pg_temp.visible_memberships(), array[pg_temp.pid(62), pg_temp.pid(64)],
  'Chaima still sees her own past membership row, and the public league''s'
);
reset role;

-- ---------------------------------------------------------------------------
-- Anonymous: no policy, so nothing, even with a grant (anon has no USAGE on
-- app either; this transaction lends it, and the rollback takes it back)
-- ---------------------------------------------------------------------------
grant usage on schema app to anon;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  pg_temp.visible_leagues(), '{}'::uuid[],
  'an anonymous reader sees no league, not even the public one: the policy is for signed-in accounts'
);
select extensions.is(
  pg_temp.visible_memberships(), '{}'::uuid[],
  'an anonymous reader sees no membership'
);
reset role;

-- ---------------------------------------------------------------------------
-- The service paths are not affected
-- ---------------------------------------------------------------------------
select extensions.ok(
  (select rolbypassrls or rolsuper from pg_roles where rolname = (
    select pg_get_userbyid(proowner) from pg_proc
    where oid = 'app_private.fantasy_is_active_league_member(uuid)'::regprocedure)),
  'the helper''s owner bypasses RLS, so its membership read does not expand any policy'
);
select extensions.is(
  (select count(*)::integer from app.fantasy_leagues where id between pg_temp.pid(50) and pg_temp.pid(59)),
  3,
  'the owner role (SECURITY DEFINER api.* functions) still sees every league'
);

select * from extensions.finish();
rollback;
