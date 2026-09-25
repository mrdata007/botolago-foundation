-- Match votes (20260925234000): who may vote, the lock at kick-off, the
-- totals, and the accounts they leave out.
--
-- The functions read the real database clock, so the matches are placed
-- around the moment the test starts.
begin;
select extensions.no_plan();

create function pg_temp.pid(n integer) returns uuid language sql immutable as $$
  select ('a7300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated","aal":"aal1"}', p_id), true)
$$;
-- A visitor, or the test itself acting as the database owner: no account.
create function pg_temp.as_nobody() returns void language sql as $$
  select set_config('request.jwt.claims', '', true)
$$;
create function pg_temp.question(p_votes jsonb, p_question text) returns jsonb
language sql immutable as $$
  select item from jsonb_array_elements(p_votes -> 'questions') item
  where item ->> 'question' = p_question
$$;

create temporary table clock on commit drop as
select date_trunc('second', statement_timestamp()) as t0;

-- ---------------------------------------------------------------------------
-- Fixture: one current season with a journée, one old season
-- ---------------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.pid(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.pid(2), 'match-votes-test', 'Match Votes Test', 'MVT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values
  (pg_temp.pid(3), pg_temp.pid(2), 'Current', current_date - 60, current_date + 300, 'active', true),
  (pg_temp.pid(4), pg_temp.pid(2), 'Previous', current_date - 420, current_date - 61, 'completed', false);
insert into app.rounds (id, season_id, round_number, name) values
  (pg_temp.pid(11), pg_temp.pid(3), 1, 'Journée 1'),
  (pg_temp.pid(19), pg_temp.pid(4), 30, 'Journée 30');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.pid(100 + n), 'match-votes-club-' || n, 'Votes Club ' || n, 'VC' || n, 'V' || n,
  (select id from app.countries where iso_alpha2 = 'MA')
from generate_series(1, 8) n;

-- F1 kicks off in an hour; F2 is being played; F3 is postponed; F4 is last
-- season's; F5 has no journée.
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, provider_updated_at)
select v.id, pg_temp.pid(2), v.season_id, v.round_id, v.home, v.away, clock.t0 + v.kickoff,
  v.status::app.fixture_status, clock.t0 - interval '1 day'
from clock cross join (values
  (pg_temp.pid(1001), pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(101), pg_temp.pid(102),
    interval '1 hour', 'not_started'),
  (pg_temp.pid(1002), pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(103), pg_temp.pid(104),
    interval '-30 minutes', 'live_first_half'),
  (pg_temp.pid(1003), pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(105), pg_temp.pid(106),
    interval '3 hours', 'postponed'),
  (pg_temp.pid(1004), pg_temp.pid(4), pg_temp.pid(19), pg_temp.pid(107), pg_temp.pid(108),
    interval '1 day', 'not_started'),
  (pg_temp.pid(1005), pg_temp.pid(3), null::uuid, pg_temp.pid(101), pg_temp.pid(103),
    interval '2 days', 'not_started')
) as v(id, season_id, round_id, home, away, kickoff, status);

-- Players 1 to 4. Player 3 is banned from the start; player 4's account is
-- deleted after voting.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.pid(20 + n), '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'match-votes-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'match_votes_' || n, 'display_name', 'Votes Player ' || n),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 4) n;
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.pid(29), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'match-votes-staff@example.test', statement_timestamp(), 'hash', '{}',
  '{"username":"match_votes_staff"}', statement_timestamp(), statement_timestamp());
insert into app_private.staff_principals (id, auth_user_id) values (pg_temp.pid(30), pg_temp.pid(29));
insert into app_private.user_bans (user_id, banned_by_principal_id, reason)
values (pg_temp.pid(23), pg_temp.pid(30), 'Match votes fixture ban.');

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
select extensions.ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'app.match_votes'::regclass),
  'app.match_votes enables and forces row level security');
select extensions.ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated', 'service_role']) as r(role)
  cross join unnest(array['select', 'insert', 'update', 'delete']) as p(privilege)
  where has_table_privilege(r.role, 'app.match_votes', p.privilege)
), 'no API role holds any privilege on app.match_votes');
select extensions.ok(
  has_function_privilege('anon', 'api.match_votes(uuid)', 'execute')
    and has_function_privilege('authenticated', 'api.match_votes(uuid)', 'execute'),
  'visitors and players may read the totals');
select extensions.ok(
  not has_function_privilege('anon', 'api.cast_match_vote(uuid, text, text)', 'execute')
    and has_function_privilege('authenticated', 'api.cast_match_vote(uuid, text, text)', 'execute'),
  'only a signed-in player may vote');

-- ---------------------------------------------------------------------------
-- The switch: nothing while Pronostics is off, testers only in testers mode
-- ---------------------------------------------------------------------------
select app_private.predictions_configure('off', true, '{}', pg_temp.pid(2));

set local role anon;
select extensions.is(api.match_votes(pg_temp.pid(1001)) -> 'allowed', 'false'::jsonb,
  'while the game is off, a visitor reads allowed: false');
reset role;
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));
select extensions.throws_ok($$select api.cast_match_vote(pg_temp.pid(1001), 'winner', 'home')$$,
  'PT403', 'predictions_unavailable', 'while the game is off, nobody can vote');
reset role;

select app_private.predictions_configure('testers', null, array[pg_temp.pid(21)]);
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(22));
select extensions.throws_ok($$select api.cast_match_vote(pg_temp.pid(1001), 'winner', 'home')$$,
  'PT403', 'predictions_unavailable', 'in testers mode, a player who is not a tester cannot vote');
select pg_temp.as_user(pg_temp.pid(21));
select extensions.is(
  pg_temp.question(api.cast_match_vote(pg_temp.pid(1001), 'winner', 'home'), 'winner') -> 'mine',
  '"home"'::jsonb, 'in testers mode, a tester votes');
reset role;

select app_private.predictions_configure('public');

-- ---------------------------------------------------------------------------
-- Reading as a visitor
-- ---------------------------------------------------------------------------
select pg_temp.as_nobody();
set local role anon;
create temporary table visitor_read on commit drop as
select api.match_votes(pg_temp.pid(1001)) as votes;
reset role;
select extensions.is((select votes -> 'allowed' from visitor_read), 'true'::jsonb,
  'a visitor may read the totals once the game is public');
select extensions.is((select votes -> 'covered' from visitor_read), 'true'::jsonb,
  'a match of the current season with a journée is covered');
select extensions.is((select votes -> 'open' from visitor_read), 'true'::jsonb,
  'a match an hour away is open');
select extensions.is(
  (select jsonb_agg(item ->> 'question') from visitor_read, jsonb_array_elements(votes -> 'questions') item),
  '["winner", "both_score", "first_goal"]'::jsonb,
  'the three questions, always in the same order');
select extensions.is(
  (select pg_temp.question(votes, 'winner') -> 'counts' from visitor_read),
  '{"home": 1, "draw": 0, "away": 0}'::jsonb,
  'the totals list every answer, zero included (the tester''s vote counts)');
select extensions.is(
  (select pg_temp.question(votes, 'first_goal') -> 'counts' from visitor_read),
  '{"home": 0, "none": 0, "away": 0}'::jsonb,
  'first goal: home, none, away');
select extensions.is((select pg_temp.question(votes, 'winner') -> 'mine' from visitor_read),
  'null'::jsonb, 'a visitor has no vote of their own');

set local role authenticated;
select pg_temp.as_nobody();
select extensions.throws_ok($$select api.cast_match_vote(pg_temp.pid(1001), 'winner', 'home')$$,
  'PT401', 'predictions_unauthenticated', 'a request without an account cannot vote');
reset role;

-- ---------------------------------------------------------------------------
-- Voting, changing a vote, and the totals
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(22));
select api.cast_match_vote(pg_temp.pid(1001), 'winner', 'draw');
select api.cast_match_vote(pg_temp.pid(1001), 'both_score', 'yes');
select pg_temp.as_user(pg_temp.pid(24));
select api.cast_match_vote(pg_temp.pid(1001), 'winner', 'away');
select pg_temp.as_user(pg_temp.pid(21));
create temporary table changed on commit drop as
select api.cast_match_vote(pg_temp.pid(1001), 'winner', 'away') as votes;
reset role;
select extensions.is((select pg_temp.question(votes, 'winner') -> 'counts' from changed),
  '{"home": 0, "draw": 1, "away": 2}'::jsonb,
  'a changed vote moves from one answer to the other; each account counts once');
select extensions.is((select pg_temp.question(votes, 'winner') -> 'mine' from changed),
  '"away"'::jsonb, 'the answer carries the caller''s own choice');
select extensions.is((select pg_temp.question(votes, 'both_score') -> 'mine' from changed),
  'null'::jsonb, 'and nothing for a question the caller has not answered');
select extensions.is((select pg_temp.question(votes, 'both_score') -> 'counts' from changed),
  '{"yes": 1, "no": 0}'::jsonb, 'another player''s answer counts in the totals');
select extensions.is(
  (select count(*)::integer from app.match_votes where fixture_id = pg_temp.pid(1001)), 4,
  'one row per account, match and question');

set local role authenticated;
select pg_temp.as_user(pg_temp.pid(22));
select extensions.throws_ok($$select api.cast_match_vote(pg_temp.pid(1001), 'winner', 'yes')$$,
  'PT400', 'validation_failed', 'an answer of another question is refused');
select extensions.throws_ok($$select api.cast_match_vote(pg_temp.pid(1001), 'score', 'home')$$,
  'PT400', 'validation_failed', 'an unknown question is refused');
select extensions.throws_ok($$select api.cast_match_vote(null, 'winner', 'home')$$,
  'PT400', 'validation_failed', 'a vote without a match is refused');

-- ---------------------------------------------------------------------------
-- The lock and the matches not covered
-- ---------------------------------------------------------------------------
select extensions.throws_ok($$select api.cast_match_vote(pg_temp.pid(1002), 'winner', 'home')$$,
  'PT409', 'match_vote_closed', 'a match being played takes no vote');
select extensions.throws_ok($$select api.cast_match_vote(pg_temp.pid(1003), 'winner', 'home')$$,
  'PT409', 'match_vote_closed', 'a postponed match takes no vote');
select extensions.throws_ok($$select api.cast_match_vote(pg_temp.pid(1004), 'winner', 'home')$$,
  'PT404', 'match_vote_unavailable', 'a match of another season is not covered');
select extensions.throws_ok($$select api.cast_match_vote(pg_temp.pid(1005), 'winner', 'home')$$,
  'PT404', 'match_vote_unavailable', 'a match without a journée is not covered');
select extensions.throws_ok($$select api.cast_match_vote(pg_temp.pid(9999), 'winner', 'home')$$,
  'PT404', 'match_vote_unavailable', 'an unknown match is not covered');
select extensions.is(api.match_votes(pg_temp.pid(1002)) -> 'open', 'false'::jsonb,
  'a match being played reads as closed');
select extensions.is(api.match_votes(pg_temp.pid(1004)) -> 'covered', 'false'::jsonb,
  'a match of another season reads as not covered');
reset role;

-- The vote made before kick-off stays, and still counts, once it is played.
select pg_temp.as_nobody();
update app.fixtures set status = 'live_first_half', kickoff_at = (select t0 from clock) - interval '5 minutes'
where id = pg_temp.pid(1001);
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(22));
select extensions.throws_ok($$select api.cast_match_vote(pg_temp.pid(1001), 'winner', 'home')$$,
  'PT409', 'match_vote_closed', 'once the match kicks off, a vote can no longer change');
select extensions.is(pg_temp.question(api.match_votes(pg_temp.pid(1001)), 'winner') -> 'counts',
  '{"home": 0, "draw": 1, "away": 2}'::jsonb, 'the votes cast before kick-off still count');
reset role;

-- ---------------------------------------------------------------------------
-- Banned and deleted accounts
-- ---------------------------------------------------------------------------
select pg_temp.as_nobody();
update app.fixtures set status = 'not_started', kickoff_at = (select t0 from clock) + interval '1 hour'
where id = pg_temp.pid(1001);
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(23));
select extensions.throws_ok($$select api.cast_match_vote(pg_temp.pid(1001), 'winner', 'home')$$,
  'PT403', 'account_banned', 'a banned account cannot vote');
reset role;
select pg_temp.as_nobody();

insert into app_private.user_bans (user_id, banned_by_principal_id, reason)
values (pg_temp.pid(22), pg_temp.pid(30), 'Banned after voting.');
update app.profiles set deleted_at = statement_timestamp() where id = pg_temp.pid(24);
select extensions.is(pg_temp.question(api.match_votes(pg_temp.pid(1001)), 'winner') -> 'counts',
  '{"home": 0, "draw": 0, "away": 1}'::jsonb,
  'the totals leave out a banned account and a deleted one');
select extensions.is(pg_temp.question(api.match_votes(pg_temp.pid(1001)), 'both_score') -> 'counts',
  '{"yes": 0, "no": 0}'::jsonb, 'on every question');

delete from auth.users where id = pg_temp.pid(21);
select extensions.is(
  (select count(*)::integer from app.match_votes where user_id = pg_temp.pid(21)), 0,
  'an account removed for good takes its votes with it');

select * from extensions.finish();
rollback;
