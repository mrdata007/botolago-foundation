-- Public ranking exclusions (20261011160000): test and QA accounts hidden from
-- the public rankings, reversibly, without touching stored ranks.
--
-- Accounts: U1 staff (platform admin), U2..U7 managers. Overall cumulative
-- stored ranks: U2 1, U3 2, U4 3, U5 4, U6 5, U7 6. U2 and U4 get hidden, so
-- the public board must read U3 1, U5 2, U6 3, U7 4 with no gap.
--
-- Covered: the admin gate and audit; the season board (order, ranks, total,
-- cursor, previous rank, the caller's own myRank); public vs private league
-- boards; the league list leader; the Pronostics board; un-hiding; and that
-- the stored rows were never rewritten.
begin;
select extensions.no_plan();
select set_config('app.environment', 'test', true);

create function pg_temp.id(k integer, n integer) returns uuid language sql immutable as $$
  select ('d1' || lpad(k::text, 6, '0') || '-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.shown(p_items jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_array(item ->> 'teamId', item -> 'rank')
    order by (item ->> 'rank')::bigint), '[]'::jsonb)
  from jsonb_array_elements(p_items) item
$$;
create function pg_temp.team(n integer) returns text language sql immutable as $$
  select pg_temp.id(9, n)::text
$$;

-- ---------------------------------------------------------------------------
-- Fixture: one football and one fantasy season, one finalized gameweek
-- ---------------------------------------------------------------------------

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id(1, 1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id(2, 1), 'ranking-hide-test', 'Ranking Hide Test', 'RHT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA' limit 1));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id(3, 1), pg_temp.id(2, 1), '2089/90', '2089-08-01', '2090-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
values (pg_temp.id(4, 1), pg_temp.id(3, 1), 1, 'Gameweek 1', 'completed');
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id(5, 1), pg_temp.id(2, 1), 'ranking-hide-test', 'Ranking Hide Test', true);
insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values (pg_temp.id(6, 1), pg_temp.id(5, 1), pg_temp.id(3, 1),
  'f6100000-0000-4000-8000-000000000100', '2089/90', 'active', '2089-08-01', '2090-06-30');
insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status, finalized_at, points_state
) values (pg_temp.id(7, 1), pg_temp.id(6, 1), pg_temp.id(4, 1), 1, 'Gameweek 1',
  '2090-01-01T11:00:00Z', '2090-01-01T12:00:00Z', '2090-01-08T12:00:00Z', 'finalized',
  '2090-01-08T13:00:00Z', 'final');

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select pg_temp.id(8, i), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'hide-' || i || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'hide_user_' || i), statement_timestamp(), statement_timestamp()
from generate_series(1, 7) i;
update app.profiles set display_name = 'Manager ' || right(username, 1)
where id in (select pg_temp.id(8, i) from generate_series(1, 7) i);

insert into app.fantasy_teams (
  id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value,
  free_transfers, status
)
select pg_temp.id(9, i), pg_temp.id(8, i), pg_temp.id(6, 1), pg_temp.id(7, 1),
  'Team ' || i, 0, 100, 1, 'active'
from generate_series(2, 7) i;

-- Stored ranks: teams 2..7 hold overall ranks 1..6 (previous rank one lower).
-- The gameweek board runs the other way round, so it differs from the season.
insert into app.fantasy_rankings (
  fantasy_season_id, gameweek_id, league_id, fantasy_team_id, rank, previous_rank,
  total_points, gameweek_points, transfer_hits, calculation_version, calculated_at
)
select pg_temp.id(6, 1), null, null, pg_temp.id(9, i), i - 1, i,
  80 - i * 10, 10, 0, 1, '2090-01-08T13:00:00Z'
from generate_series(2, 7) i;
insert into app.fantasy_rankings (
  fantasy_season_id, gameweek_id, league_id, fantasy_team_id, rank, previous_rank,
  total_points, gameweek_points, transfer_hits, calculation_version, calculated_at
)
select pg_temp.id(6, 1), pg_temp.id(7, 1), null, pg_temp.id(9, i), 8 - i, null,
  i * 10, i * 10, 0, 1, '2090-01-08T13:00:00Z'
from generate_series(2, 7) i;

-- A public league (teams 2..5) and a private league (teams 2, 3, 5) with
-- their own boards. U3 owns the private league.
insert into app.fantasy_leagues (
  id, fantasy_season_id, owner_user_id, name, visibility, invite_code_digest,
  invite_code_hint, active, member_count
) values
  (pg_temp.id(10, 1), pg_temp.id(6, 1), pg_temp.id(8, 3), 'Open League', 'public', null, null, true, 4),
  (pg_temp.id(10, 2), pg_temp.id(6, 1), pg_temp.id(8, 3), 'Closed League', 'private',
    repeat('a', 64), 'AAAA', true, 3);
insert into app.fantasy_league_memberships (league_id, fantasy_team_id, user_id, role)
select pg_temp.id(10, league), pg_temp.id(9, account), pg_temp.id(8, account), 'member'
from (values (1, 2), (1, 3), (1, 4), (1, 5), (2, 2), (2, 3), (2, 5)) as m(league, account);
insert into app.fantasy_rankings (
  fantasy_season_id, gameweek_id, league_id, fantasy_team_id, rank, previous_rank,
  total_points, gameweek_points, transfer_hits, calculation_version, calculated_at
)
select pg_temp.id(6, 1), null, pg_temp.id(10, league), pg_temp.id(9, account), position, position + 1,
  100 - position, 10, 0, 1, '2090-01-08T13:00:00Z'
from (values (1, 2, 1), (1, 3, 2), (1, 4, 3), (1, 5, 4), (2, 2, 1), (2, 3, 2), (2, 5, 3))
  as r(league, account, position);

-- Pronostics: season standings for U2..U7, ranks 1..6 (U4 and U5 tie on 3).
create temporary table stored_before on commit drop as
select 'fantasy' as board, fantasy_team_id::text as who, rank, previous_rank
from app.fantasy_rankings;

insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id(14, n), 'rank-hide-club-' || n, 'Hide Club ' || n, 'HC' || n, 'H' || n,
  (select id from app.countries where iso_alpha2 = 'MA' limit 1)
from generate_series(1, 2) n;
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, finalized_at, provider_updated_at)
values (pg_temp.id(15, 1), pg_temp.id(2, 1), pg_temp.id(3, 1), pg_temp.id(4, 1),
  pg_temp.id(14, 1), pg_temp.id(14, 2), statement_timestamp() - interval '3 days', 'finished', 1, 0,
  statement_timestamp() - interval '1 day', statement_timestamp() - interval '1 day');
insert into app.prediction_standings (id, season_id, round_id, user_id, points, exact_count,
  outcome_count, miss_count, void_count, scored_count, predicted_count, rounds_played, rank)
select pg_temp.id(16, i), pg_temp.id(3, 1), null, pg_temp.id(8, i), 100 - i, 3, 0, 0, 0, 3, 3, 1,
  case when i = 5 then 3 else greatest(i - 1, 1) end
from generate_series(2, 7) i;
-- ranks: U2 1, U3 2, U4 3, U5 3 (tie), U6 5, U7 6
update app.prediction_standings set rank = case user_id
  when pg_temp.id(8, 2) then 1 when pg_temp.id(8, 3) then 2 when pg_temp.id(8, 4) then 3
  when pg_temp.id(8, 5) then 3 when pg_temp.id(8, 6) then 5 else 6 end;
select app_private.predictions_configure('public', true, '{}', pg_temp.id(2, 1));

-- U1 becomes the platform admin (verified factor, aal2 session). U3 has an
-- aal2 session but no staff principal.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (pg_temp.id(12, 1), pg_temp.id(8, 1), 'Hide TOTP', 'totp', 'verified',
  statement_timestamp(), statement_timestamp());
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  (pg_temp.id(11, 1), pg_temp.id(8, 1), statement_timestamp(), statement_timestamp(), 'aal2'),
  (pg_temp.id(11, 3), pg_temp.id(8, 3), statement_timestamp(), statement_timestamp(), 'aal2');
select extensions.lives_ok(
  format($$select api.admin_bootstrap_first_platform_admin(%L,
    'Bootstrap deterministic ranking exclusion test platform administrator.', true)$$,
    pg_temp.id(8, 1)),
  'the fixture bootstraps one platform administrator'
);

-- ---------------------------------------------------------------------------
-- Before anything is hidden: the board is the stored ranks
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  pg_temp.shown(api.fantasy_overall_standings(pg_temp.id(6, 1)) -> 'items'),
  jsonb_build_array(
    jsonb_build_array(pg_temp.team(2), 1), jsonb_build_array(pg_temp.team(3), 2),
    jsonb_build_array(pg_temp.team(4), 3), jsonb_build_array(pg_temp.team(5), 4),
    jsonb_build_array(pg_temp.team(6), 5), jsonb_build_array(pg_temp.team(7), 6)),
  'with nobody hidden the board shows the stored ranks'
);
reset role;

-- ---------------------------------------------------------------------------
-- Admin: gate, hide, list, audit, idempotency
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', format(
  '{"sub":"%s","role":"authenticated","aal":"aal2","session_id":"%s"}',
  pg_temp.id(8, 3), pg_temp.id(11, 3)), true);
select extensions.throws_ok(
  format($$select api.admin_set_public_ranking_exclusion(%L, null, true,
    'A manager hiding someone.', gen_random_uuid())$$, pg_temp.id(8, 2)),
  'PT403', 'staff_access_denied', 'a manager who is not staff cannot hide an account');
select extensions.throws_ok(
  $$select api.admin_list_public_ranking_exclusions()$$,
  'PT403', 'staff_access_denied', 'a manager who is not staff cannot read the list');

select set_config('request.jwt.claims', format(
  '{"sub":"%s","role":"authenticated","aal":"aal1","session_id":"%s"}',
  pg_temp.id(8, 1), pg_temp.id(11, 1)), true);
select extensions.throws_ok(
  $$select api.admin_list_public_ranking_exclusions()$$,
  'PT403', 'mfa_assurance_insufficient', 'the admin surface requires a second factor');

select set_config('request.jwt.claims', format(
  '{"sub":"%s","role":"authenticated","aal":"aal2","session_id":"%s"}',
  pg_temp.id(8, 1), pg_temp.id(11, 1)), true);
select extensions.throws_ok(
  format($$select api.admin_set_public_ranking_exclusion(%L, null, true, 'short',
    gen_random_uuid())$$, pg_temp.id(8, 2)),
  'PT400', 'ranking_reason_invalid', 'a reason under 8 characters is refused');
select extensions.throws_ok(
  $$select api.admin_set_public_ranking_exclusion(null, 'nobody_here', true,
    'Hide an unknown account.', gen_random_uuid())$$,
  'PT404', 'ranking_account_not_found', 'an unknown username is reported');
select extensions.throws_ok(
  format($$select api.admin_set_public_ranking_exclusion(%L, 'hide_user_2', true,
    'Both an id and a name.', gen_random_uuid())$$, pg_temp.id(8, 2)),
  'PT400', 'validation_failed', 'exactly one of user id and username is required');

select set_config('test.key', gen_random_uuid()::text, true);
select extensions.is(
  api.admin_set_public_ranking_exclusion(null, 'HIDE_USER_2', true,
    'QA account used for launch checks.', current_setting('test.key')::uuid) ->> 'hidden',
  'true', 'an admin hides an account by username, case-insensitively');
select extensions.is(
  api.admin_set_public_ranking_exclusion(null, 'HIDE_USER_2', true,
    'QA account used for launch checks.', current_setting('test.key')::uuid) ->> 'hidden',
  'true', 'repeating the request with the same key returns the first answer');
select extensions.is(
  api.admin_set_public_ranking_exclusion(pg_temp.id(8, 4), null, true,
    'End to end test account.', gen_random_uuid()) ->> 'hidden',
  'true', 'an admin hides an account by user id');
select extensions.is(
  (select jsonb_agg(item ->> 'username' order by item ->> 'username')
   from jsonb_array_elements(api.admin_list_public_ranking_exclusions() -> 'items') item),
  '["hide_user_2", "hide_user_4"]'::jsonb, 'the list shows every hidden account');
reset role;

select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events
   where action = 'rankings.set_exclusion' and target_domain = 'rankings'
     and reason = 'QA account used for launch checks.' and target_entity_id = pg_temp.id(8, 2)),
  1, 'the change and its reason are in the admin audit log, once');
select extensions.is(
  (select count(*)::integer from app_private.public_ranking_exclusions), 2,
  'two accounts are hidden');

-- ---------------------------------------------------------------------------
-- The season board
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  pg_temp.shown(api.fantasy_overall_standings(pg_temp.id(6, 1)) -> 'items'),
  jsonb_build_array(
    jsonb_build_array(pg_temp.team(3), 1), jsonb_build_array(pg_temp.team(5), 2),
    jsonb_build_array(pg_temp.team(6), 3), jsonb_build_array(pg_temp.team(7), 4)),
  'hidden teams are gone and the shown ranks are 1..4 with no gap'
);
select extensions.is(
  (api.fantasy_overall_standings(pg_temp.id(6, 1)) ->> 'total')::integer, 4,
  'the total counts the visible teams only');
select extensions.is(
  (select jsonb_agg(item -> 'previousRank' order by (item ->> 'rank')::bigint)
   from jsonb_array_elements(api.fantasy_overall_standings(pg_temp.id(6, 1)) -> 'items') item),
  '[2, 3, 4, 5]'::jsonb,
  'previous ranks are renumbered the same way');
-- A gameweek board: stored ranks U7 1, U6 2, U5 3, U4 4, U3 5, U2 6.
select extensions.is(
  pg_temp.shown(api.fantasy_overall_standings(pg_temp.id(6, 1), pg_temp.id(7, 1)) -> 'items'),
  jsonb_build_array(
    jsonb_build_array(pg_temp.team(7), 1), jsonb_build_array(pg_temp.team(6), 2),
    jsonb_build_array(pg_temp.team(5), 3), jsonb_build_array(pg_temp.team(3), 4)),
  'a gameweek board hides the same accounts and renumbers on its own stored ranks');

-- Keyset paging walks the stored order exactly once, over the visible rows.
select set_config('test.page_one',
  api.fantasy_overall_standings(pg_temp.id(6, 1), null, null, null, 2)::text, true);
select extensions.is(
  pg_temp.shown(current_setting('test.page_one')::jsonb -> 'items'),
  jsonb_build_array(jsonb_build_array(pg_temp.team(3), 1), jsonb_build_array(pg_temp.team(5), 2)),
  'the first page of two holds the first two visible teams');
select extensions.is(
  current_setting('test.page_one')::jsonb -> 'nextCursor',
  jsonb_build_object('rank', 4, 'teamId', pg_temp.team(5)),
  'the cursor stays on the stored rank of the last visible row');
select set_config('test.page_two', api.fantasy_overall_standings(
  pg_temp.id(6, 1), null,
  (current_setting('test.page_one')::jsonb -> 'nextCursor' ->> 'rank')::bigint,
  (current_setting('test.page_one')::jsonb -> 'nextCursor' ->> 'teamId')::uuid, 2)::text, true);
select extensions.is(
  pg_temp.shown(current_setting('test.page_two')::jsonb -> 'items'),
  jsonb_build_array(jsonb_build_array(pg_temp.team(6), 3), jsonb_build_array(pg_temp.team(7), 4)),
  'the second page continues at shown rank 3, with no gap and no repeat');
select extensions.is(
  current_setting('test.page_two')::jsonb -> 'nextCursor', 'null'::jsonb,
  'the last page advertises no cursor');

-- A page that ends just before a hidden team does not promise a cursor to it.
select extensions.is(
  api.fantasy_overall_standings(pg_temp.id(6, 1), null, null, null, 4) -> 'nextCursor',
  'null'::jsonb, 'a full page of the visible rows has no cursor');
reset role;

-- The hidden manager's private view: their own myRank and team still resolve,
-- with the rank the account would hold on the public board.
set local role authenticated;
select set_config('request.jwt.claims', format(
  '{"sub":"%s","role":"authenticated","aal":"aal1"}', pg_temp.id(8, 4)), true);
select extensions.is(
  api.fantasy_overall_standings(pg_temp.id(6, 1)) -> 'myRank' ->> 'teamId',
  pg_temp.team(4), 'a hidden manager still gets their own myRank');
select extensions.is(
  (api.fantasy_overall_standings(pg_temp.id(6, 1)) -> 'myRank' ->> 'rank')::bigint, 2::bigint,
  'and it is the rank they would hold: stored 3, minus one hidden team above');
select extensions.is(
  (select count(*)::integer from jsonb_array_elements(
     api.fantasy_overall_standings(pg_temp.id(6, 1)) -> 'items') item
   where item ->> 'teamId' = pg_temp.team(4)),
  0, 'but their row is not in the public list, even for themselves');
-- A visible manager sees the same gapless board and a consistent myRank.
select set_config('request.jwt.claims', format(
  '{"sub":"%s","role":"authenticated","aal":"aal1"}', pg_temp.id(8, 6)), true);
select extensions.is(
  (api.fantasy_overall_standings(pg_temp.id(6, 1)) -> 'myRank' ->> 'rank')::bigint, 3::bigint,
  'a visible manager myRank matches the row shown on the board');
reset role;

-- ---------------------------------------------------------------------------
-- League boards: public leagues hide, private leagues do not
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  pg_temp.shown(api.fantasy_league_standings(pg_temp.id(10, 1)) -> 'items'),
  jsonb_build_array(jsonb_build_array(pg_temp.team(3), 1), jsonb_build_array(pg_temp.team(5), 2)),
  'a public league board hides the accounts and renumbers');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', format(
  '{"sub":"%s","role":"authenticated","aal":"aal1"}', pg_temp.id(8, 3)), true);
select extensions.is(
  pg_temp.shown(api.fantasy_league_standings(pg_temp.id(10, 2)) -> 'items'),
  jsonb_build_array(jsonb_build_array(pg_temp.team(2), 1), jsonb_build_array(pg_temp.team(3), 2),
    jsonb_build_array(pg_temp.team(5), 3)),
  'a private league shows all its members, hidden or not: the members chose each other');
select extensions.is(
  (select item ->> 'leaderName' from jsonb_array_elements(
     api.fantasy_leagues(pg_temp.id(6, 1)) -> 'items') item where item ->> 'name' = 'Open League'),
  'Team 3', 'the leader of a public league is the first visible team');
select extensions.is(
  (select item ->> 'leaderName' from jsonb_array_elements(
     api.fantasy_leagues(pg_temp.id(6, 1)) -> 'items') item where item ->> 'name' = 'Closed League'),
  'Team 2', 'the leader of a private league is unchanged');
select extensions.is(
  (select (item ->> 'rank')::integer from jsonb_array_elements(
     api.fantasy_leagues(pg_temp.id(6, 1)) -> 'items') item where item ->> 'name' = 'Open League'),
  1, 'a member of a public league sees their rank on the same gapless scale (stored 2, one hidden above)');
reset role;

-- ---------------------------------------------------------------------------
-- Pronostics
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('test.pron', api.predictions_leaderboard('season')::text, true);
reset role;
select extensions.is(
  (select jsonb_agg(item -> 'rank' order by (item ->> 'rank')::integer, item ->> 'id')
   from jsonb_array_elements(current_setting('test.pron')::jsonb -> 'items') item),
  '[1, 2, 3, 4]'::jsonb,
  'the Pronostics board hides the accounts and renumbers: stored 2, 3, 5, 6 become 1, 2, 3, 4');
select extensions.is((current_setting('test.pron')::jsonb ->> 'total')::integer, 4,
  'the Pronostics total counts the visible players only');
select extensions.is(
  (select bool_or((item ->> 'tied')::boolean)
   from jsonb_array_elements(current_setting('test.pron')::jsonb -> 'items') item),
  false, 'a tie with a hidden account is no longer flagged as a tie');

-- ---------------------------------------------------------------------------
-- Un-hiding: reversible, and the stored rows were never touched
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', format(
  '{"sub":"%s","role":"authenticated","aal":"aal2","session_id":"%s"}',
  pg_temp.id(8, 1), pg_temp.id(11, 1)), true);
select extensions.is(
  api.admin_set_public_ranking_exclusion(null, 'hide_user_2', false,
    'Cleared after the launch checks.', gen_random_uuid()) ->> 'hidden',
  'false', 'an admin shows an account again');
select extensions.is(
  (select jsonb_agg(item ->> 'username') from jsonb_array_elements(
     api.admin_list_public_ranking_exclusions() -> 'items') item),
  '["hide_user_4"]'::jsonb, 'the list no longer holds it');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(
  pg_temp.shown(api.fantasy_overall_standings(pg_temp.id(6, 1)) -> 'items'),
  jsonb_build_array(
    jsonb_build_array(pg_temp.team(2), 1), jsonb_build_array(pg_temp.team(3), 2),
    jsonb_build_array(pg_temp.team(5), 3), jsonb_build_array(pg_temp.team(6), 4),
    jsonb_build_array(pg_temp.team(7), 5)),
  'the shown account is back at once, ranks renumbered for the one still hidden');
reset role;
select extensions.is(
  (select count(*)::integer from app_private.admin_audit_events
   where action = 'rankings.set_exclusion' and target_entity_id = pg_temp.id(8, 2)), 2,
  'hiding and showing are both in the audit log');
select extensions.is(
  (select count(*)::integer from (
     select 'fantasy', fantasy_team_id::text, rank, previous_rank from app.fantasy_rankings
     except select board, who, rank, previous_rank from stored_before) changed),
  0, 'no stored ranking row was rewritten');

-- ---------------------------------------------------------------------------
-- Declared surface
-- ---------------------------------------------------------------------------

select extensions.ok(
  (select relrowsecurity and relforcerowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'app_private' and c.relname = 'public_ranking_exclusions'),
  'the exclusion list enables and forces row level security');
select extensions.ok(
  not has_table_privilege('anon', 'app_private.public_ranking_exclusions', 'select')
  and not has_table_privilege('authenticated', 'app_private.public_ranking_exclusions', 'select')
  and not has_table_privilege('service_role', 'app_private.public_ranking_exclusions', 'select')
  and not has_table_privilege('authenticated', 'app_private.public_ranking_exclusions', 'insert'),
  'no client role can read or write the exclusion list directly');
select extensions.ok(
  has_function_privilege('authenticated', 'api.admin_set_public_ranking_exclusion(uuid, text, boolean, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'api.admin_set_public_ranking_exclusion(uuid, text, boolean, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'api.admin_list_public_ranking_exclusions()', 'execute'),
  'only signed-in callers can reach the admin functions, and the gate inside decides');
select extensions.ok(
  not has_function_privilege('anon', 'app_private.fantasy_hidden_ahead(uuid, uuid, uuid, bigint, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.prediction_hidden_ahead(uuid, uuid, integer)', 'execute'),
  'the helpers are not callable by clients');
select extensions.ok(
  has_function_privilege('anon', 'api.fantasy_overall_standings(uuid, uuid, bigint, uuid, integer)', 'execute')
  and has_function_privilege('anon', 'api.fantasy_league_standings(uuid, uuid, bigint, uuid, integer)', 'execute'),
  'the public readers keep their grants');
select extensions.is(
  (select name from app_private.admin_permissions where name = 'rankings.manage'),
  'rankings.manage', 'the rankings.manage permission exists');
select extensions.ok(
  exists (select 1 from app_private.admin_role_permissions mapping
    join app_private.admin_roles role on role.id = mapping.role_id
    join app_private.admin_permissions permission on permission.id = mapping.permission_id
    where role.name = 'platform_admin' and permission.name = 'rankings.manage'),
  'platform_admin holds rankings.manage');

select * from extensions.finish();
rollback;
