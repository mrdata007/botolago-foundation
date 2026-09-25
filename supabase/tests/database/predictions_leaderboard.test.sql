-- Pronostics public rankings (api.predictions_leaderboard, 20260925090200):
-- pages of saved ranks, shared ranks, names for visitors and players, the
-- caller's own line, and banned or deleted players left out when read.
begin;
select extensions.no_plan();

create function pg_temp.pid(n integer) returns uuid language sql immutable as $$
  select ('a7500000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated","aal":"aal1"}', p_id), true)
$$;
create function pg_temp.names(p_page jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_array(item -> 'rank', item -> 'name', item -> 'tied')
    order by ordinality), '[]'::jsonb)
  from jsonb_array_elements(p_page -> 'items') with ordinality as t(item, ordinality)
$$;

create temporary table clock on commit drop as
select date_trunc('second', statement_timestamp()) as t0;

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.pid(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.pid(2), 'pronostics-board-test', 'Pronostics Board Test', 'PBT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.pid(3), pg_temp.pid(2), 'Current', current_date - 60, current_date + 300, 'active', true);
insert into app.rounds (id, season_id, round_number, name) values
  (pg_temp.pid(11), pg_temp.pid(3), 1, 'Journée 1'),
  (pg_temp.pid(12), pg_temp.pid(3), 2, 'Journée 2');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.pid(100 + n), 'pronos-board-club-' || n, 'Board Club ' || n, 'BC' || n, 'B' || n,
  (select id from app.countries where iso_alpha2 = 'MA')
from generate_series(1, 4) n;
-- Journée 1 is played and final; journée 2 kicks off next week.
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, finalized_at, provider_updated_at)
select v.id, pg_temp.pid(2), pg_temp.pid(3), v.round_id, pg_temp.pid(101), pg_temp.pid(102),
  clock.t0 + v.kickoff, v.status::app.fixture_status, v.home_score, v.away_score,
  case when v.status = 'finished' then clock.t0 - interval '1 day' end, clock.t0 - interval '1 day'
from clock cross join (values
  (pg_temp.pid(1001), pg_temp.pid(11), interval '-3 days', 'finished', 1, 0),
  (pg_temp.pid(1002), pg_temp.pid(12), interval '7 days', 'not_started', null::integer, null::integer)
) as v(id, round_id, kickoff, status, home_score, away_score);

-- Six players: 1 "Amine" and 2 "Sara" share first place; 3 has no display
-- name; 4 is third alone; 5 is banned after the last scoring run; 6 deleted
-- their account after it.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.pid(20 + v.n), '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'pronos-board-' || v.n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', v.username) || case when v.display is null then '{}'::jsonb
    else jsonb_build_object('display_name', v.display) end,
  statement_timestamp(), statement_timestamp()
from (values (1, 'amine_10', 'Amine'), (2, 'sara_rbt', 'Sara'), (3, 'nodisplay', null),
  (4, 'yassine_7', 'Yassine'), (5, 'rude_one', 'Rude Name'), (6, 'gone_away', 'Gone')) as v(n, username, display);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.pid(29), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'pronos-board-staff@example.test', statement_timestamp(), 'hash', '{}',
  '{"username":"board_staff"}', statement_timestamp(), statement_timestamp());
insert into app_private.staff_principals (id, auth_user_id) values (pg_temp.pid(30), pg_temp.pid(29));

-- Saved ranks as the scoring job leaves them (journée 1 and the season).
insert into app.prediction_standings (id, season_id, round_id, user_id, points, exact_count,
  outcome_count, miss_count, void_count, scored_count, predicted_count, rounds_played, rank)
select pg_temp.pid(500 + v.n + scope.offset_n), pg_temp.pid(3), scope.round_id, pg_temp.pid(20 + v.n),
  v.points, v.exact, v.outcome, v.miss, 0, v.exact + v.outcome + v.miss, v.exact + v.outcome + v.miss,
  case when scope.round_id is null then 1 end, v.rank
from (values (1, 9, 3, 0, 0, 1), (2, 9, 3, 0, 0, 1), (3, 5, 1, 2, 0, 5),
  (4, 7, 2, 1, 0, 4), (5, 8, 2, 2, 0, 3), (6, 4, 1, 1, 1, 6)) as v(n, points, exact, outcome, miss, rank)
cross join (values (pg_temp.pid(11), 0), (null::uuid, 100)) as scope(round_id, offset_n);
insert into app_private.user_bans (user_id, banned_by_principal_id, reason)
values (pg_temp.pid(25), pg_temp.pid(30), 'Offensive display name.');
update app.profiles set deleted_at = statement_timestamp() where id = pg_temp.pid(26);

select app_private.predictions_configure('public', true, '{}', pg_temp.pid(2));

-- ---------------------------------------------------------------------------
-- A visitor
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('test.page1', api.predictions_leaderboard('round', 1, null, null, 2)::text, true);
select set_config('test.page2', api.predictions_leaderboard('round', 1,
  (current_setting('test.page1')::jsonb -> 'nextCursor' ->> 'rank')::integer,
  (current_setting('test.page1')::jsonb -> 'nextCursor' ->> 'id')::uuid, 2)::text, true);
select set_config('test.season', api.predictions_leaderboard('season')::text, true);
reset role;

select extensions.is(pg_temp.names(current_setting('test.page1')::jsonb),
  '[[1, "a***0", true], [1, "s***t", true]]'::jsonb,
  'a visitor sees masked usernames, never display names; a shared rank is flagged');
select extensions.is((current_setting('test.page1')::jsonb ->> 'total')::integer, 4,
  'the first page counts the ranked players shown (banned and deleted left out)');
select extensions.is(current_setting('test.page1')::jsonb -> 'nextCursor' ->> 'id',
  pg_temp.pid(502)::text, 'a full page continues after its last line');
select extensions.is(current_setting('test.page1')::jsonb -> 'me', 'null'::jsonb, 'a visitor has no line of their own');
select extensions.is((current_setting('test.page1')::jsonb ->> 'provisional')::boolean, false,
  'a journée whose matches are all final is not provisional');
select extensions.is((current_setting('test.page1')::jsonb ->> 'matchesLeft')::integer, 0,
  'no match left in journée 1');
select extensions.is(pg_temp.names(current_setting('test.page2')::jsonb),
  '[[4, "y***7", false], [5, "n***y", false]]'::jsonb,
  'the next page: the banned player (rank 3) and the deleted account (rank 6) are left out');
select extensions.is(current_setting('test.page2')::jsonb -> 'total', 'null'::jsonb,
  'later pages do not count again');
select extensions.is(current_setting('test.page2')::jsonb -> 'nextCursor', 'null'::jsonb,
  'the last page has no cursor');
select extensions.ok(
  position('rude' in current_setting('test.page1') || current_setting('test.page2') || current_setting('test.season')) = 0
  and position('Rude' in current_setting('test.page1') || current_setting('test.page2') || current_setting('test.season')) = 0,
  'a banned player''s name never appears');
select extensions.is(
  (select jsonb_agg(item -> 'roundsPlayed') from jsonb_array_elements(current_setting('test.season')::jsonb -> 'items') item),
  '[1, 1, 1, 1]'::jsonb, 'the season ranking carries journées played');
select extensions.is(current_setting('test.season')::jsonb -> 'provisional', 'null'::jsonb,
  'provisional applies to a journée only');

-- ---------------------------------------------------------------------------
-- A signed-in player
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(24));
select set_config('test.mine', api.predictions_leaderboard('round', 1)::text, true);
reset role;
select extensions.is(pg_temp.names(current_setting('test.mine')::jsonb),
  '[[1, "Amine", true], [1, "Sara", true], [4, "Yassine", false], [5, "n***y", false]]'::jsonb,
  'players see display names; an account without one shows its masked username');
select extensions.is(
  (select jsonb_agg(item -> 'isMe') from jsonb_array_elements(current_setting('test.mine')::jsonb -> 'items') item),
  '[false, false, true, false]'::jsonb, 'the caller''s line is marked');
select extensions.is(current_setting('test.mine')::jsonb -> 'me', '{"rank": 4, "points": 7, "exact": 2}'::jsonb,
  'the caller''s own line is returned beside the page');
select extensions.ok(not (current_setting('test.mine')::jsonb ? 'userId')
  and position(pg_temp.pid(24)::text in current_setting('test.mine')) = 0,
  'no account id is ever returned');

-- The default journée is the next one to play: journée 2, not ranked yet.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(api.predictions_leaderboard() - 'items',
  '{"allowed": true, "scope": "round", "round": 2, "provisional": true, "matchesLeft": 1, "total": 0, "nextCursor": null, "me": null}'::jsonb,
  'a journée nobody has scored in yet is an empty, provisional ranking');

-- Validation.
select extensions.throws_ok($$select api.predictions_leaderboard('week')$$, 'PT400', 'validation_failed',
  'an unknown scope is refused');
select extensions.throws_ok($$select api.predictions_leaderboard('round', 1, null, null, 0)$$, 'PT400',
  'validation_failed', 'a page of zero is refused');
select extensions.throws_ok($$select api.predictions_leaderboard('round', 1, null, null, 101)$$, 'PT400',
  'validation_failed', 'more than 100 lines is refused');
select extensions.throws_ok($$select api.predictions_leaderboard('round', 1, 3, null)$$, 'PT400',
  'validation_failed', 'half a cursor is refused');
select extensions.throws_ok($$select api.predictions_leaderboard('round', 7)$$, 'PT404',
  'predictions_round_not_found', 'an unknown journée is refused');
reset role;

select * from extensions.finish();
rollback;
