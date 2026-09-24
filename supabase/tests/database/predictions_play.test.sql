-- Pronostics: who may call what, the switch, reading a journée and saving
-- predictions (20260925090000 schema, 20260925090200 api).
--
-- The functions read the real database clock, so the matches are placed
-- around the moment the test starts: kicked off hours ago, kicking off in an
-- hour, next week.
begin;
select extensions.no_plan();

create function pg_temp.pid(n integer) returns uuid language sql immutable as $$
  select ('a7200000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated","aal":"aal1"}', p_id), true)
$$;
create function pg_temp.status_of(p_result jsonb, p_fixture uuid) returns text
language sql immutable as $$
  select item ->> 'status' from jsonb_array_elements(p_result -> 'results') item
  where (item ->> 'fixtureId')::uuid = p_fixture
$$;
create function pg_temp.fixture_of(p_round jsonb, p_fixture uuid) returns jsonb
language sql immutable as $$
  select item from jsonb_array_elements(p_round -> 'fixtures') item
  where (item ->> 'id')::uuid = p_fixture
$$;

create temporary table clock on commit drop as
select date_trunc('second', statement_timestamp()) as t0;
grant select on clock to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixture: one current season, two journées; one old season
-- ---------------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.pid(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.pid(2), 'pronostics-play-test', 'Pronostics Play Test', 'PPT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values
  (pg_temp.pid(3), pg_temp.pid(2), 'Current', current_date - 60, current_date + 300, 'active', true),
  (pg_temp.pid(4), pg_temp.pid(2), 'Previous', current_date - 420, current_date - 61, 'completed', false);
insert into app.rounds (id, season_id, round_number, name) values
  (pg_temp.pid(11), pg_temp.pid(3), 1, 'Journée 1'),
  (pg_temp.pid(12), pg_temp.pid(3), 2, 'Journée 2'),
  (pg_temp.pid(19), pg_temp.pid(4), 30, 'Journée 30');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.pid(100 + n), 'pronos-play-club-' || n, 'Play Club ' || n, 'PC' || n, 'P' || n,
  (select id from app.countries where iso_alpha2 = 'MA')
from generate_series(1, 12) n;

-- Journée 1: F1 final 2-1, F2 live 1-0, F3 kicks off in an hour, F4 postponed
-- with the provider's stored 0-0. Journée 2: F5 and F6 next week, F5 carrying
-- a stored 0-0 as not-started matches do. F9: last season.
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, finalized_at, provider_updated_at)
select v.id, pg_temp.pid(2), v.season_id, v.round_id, v.home, v.away, clock.t0 + v.kickoff,
  v.status::app.fixture_status, v.home_score, v.away_score,
  case when v.final then clock.t0 - interval '10 minutes' end, clock.t0 - interval '1 day'
from clock cross join (values
  (pg_temp.pid(1001), pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(101), pg_temp.pid(102),
    interval '-3 hours', 'finished', 2, 1, true),
  (pg_temp.pid(1002), pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(103), pg_temp.pid(104),
    interval '-30 minutes', 'live_first_half', 1, 0, false),
  (pg_temp.pid(1003), pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(105), pg_temp.pid(106),
    interval '1 hour', 'not_started', null, null, false),
  (pg_temp.pid(1004), pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(107), pg_temp.pid(108),
    interval '3 hours', 'postponed', 0, 0, false),
  (pg_temp.pid(1005), pg_temp.pid(3), pg_temp.pid(12), pg_temp.pid(109), pg_temp.pid(110),
    interval '7 days', 'not_started', 0, 0, false),
  (pg_temp.pid(1006), pg_temp.pid(3), pg_temp.pid(12), pg_temp.pid(111), pg_temp.pid(112),
    interval '7 days 2 hours', 'scheduled', null, null, false),
  (pg_temp.pid(1009), pg_temp.pid(4), pg_temp.pid(19), pg_temp.pid(101), pg_temp.pid(103),
    interval '1 day', 'not_started', null, null, false)
) as v(id, season_id, round_id, home, away, kickoff, status, home_score, away_score, final);

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.pid(20 + n), '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'pronos-play-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'pronos_play_' || n, 'display_name', 'Play Player ' || n),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 3) n;

-- Player 3 is banned.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.pid(29), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'pronos-play-staff@example.test', statement_timestamp(), 'hash', '{}',
  '{"username":"pronos_play_staff"}', statement_timestamp(), statement_timestamp());
insert into app_private.staff_principals (id, auth_user_id) values (pg_temp.pid(30), pg_temp.pid(29));
insert into app_private.user_bans (user_id, banned_by_principal_id, reason)
values (pg_temp.pid(23), pg_temp.pid(30), 'Pronostics fixture ban.');

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
select extensions.ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
   where oid in ('app.predictions'::regclass, 'app.prediction_standings'::regclass,
     'app.prediction_league_members'::regclass, 'app_private.prediction_fixture_scoring'::regclass,
     'app_private.prediction_settings'::regclass, 'app_private.prediction_job_runs'::regclass,
     'app_private.prediction_guest_claims'::regclass)),
  'all seven Pronostics tables enable and force row level security');
select extensions.ok(not exists (
  select 1
  from unnest(array['app.predictions', 'app.prediction_standings', 'app.prediction_league_members',
    'app_private.prediction_fixture_scoring', 'app_private.prediction_settings',
    'app_private.prediction_job_runs', 'app_private.prediction_guest_claims']) as t(name)
  cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
  cross join unnest(array['select', 'insert', 'update', 'delete']) as p(privilege)
  where has_table_privilege(r.role, t.name, p.privilege)
), 'no API role holds any privilege on a Pronostics table');
select extensions.ok(not exists (
  select 1 from pg_policies where schemaname in ('app', 'app_private')
    and tablename in ('predictions', 'prediction_standings', 'prediction_league_members',
      'prediction_fixture_scoring', 'prediction_settings', 'prediction_job_runs',
      'prediction_guest_claims')
), 'no policy opens a Pronostics table: the functions are the only way in');

select extensions.ok(has_function_privilege('anon', 'api.predictions_round(integer, text)', 'execute'),
  'a visitor may read a journée');
select extensions.ok(has_function_privilege('anon',
  'api.predictions_leaderboard(text, integer, integer, uuid, integer)', 'execute'),
  'a visitor may read the rankings');
select extensions.ok(not exists (
  select 1 from unnest(array[
    'api.my_predictions(integer, uuid)', 'api.save_predictions(jsonb)',
    'api.claim_guest_predictions(jsonb)', 'api.join_prediction_league(text)',
    'api.leave_prediction_league(uuid)', 'api.my_prediction_leagues()',
    'api.predictions_league_standings(uuid, integer)', 'api.create_prediction_league(text)',
    'api.reset_prediction_league_invite_code(uuid)']) as f(signature)
  where has_function_privilege('anon', f.signature, 'execute')
), 'a visitor cannot call any signed-in Pronostics function');
select extensions.ok(not exists (
  select 1 from pg_proc proc
  join pg_namespace ns on ns.oid = proc.pronamespace
  cross join unnest(array['anon', 'authenticated', 'service_role']) as r(role)
  where ns.nspname = 'app_private'
    and (proc.proname like 'prediction%' or proc.proname like 'predictions%')
    and has_function_privilege(r.role, proc.oid, 'execute')
), 'no API role can call an internal Pronostics function');
select extensions.ok(not exists (
  select 1 from pg_proc proc
  join pg_namespace ns on ns.oid = proc.pronamespace
  where ns.nspname = 'api'
    and proc.proname in ('predictions_round', 'predictions_leaderboard', 'my_predictions',
      'save_predictions', 'claim_guest_predictions', 'join_prediction_league',
      'leave_prediction_league', 'my_prediction_leagues', 'predictions_league_standings',
      'create_prediction_league', 'reset_prediction_league_invite_code')
    and not (proc.prosecdef and proc.proconfig @> array['search_path=""'])
), 'every Pronostics api function is security definer with an empty search_path');
select extensions.ok(exists (
  select 1 from cron.job where jobname = 'predictions-score-tick'
    and schedule = '*/5 * * * *' and command = 'select app_private.predictions_score_tick();'
    and active
), 'the scoring job runs every five minutes');

set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));
select extensions.throws_ok($$select count(*) from app.predictions$$, '42501', null,
  'a player cannot read the predictions table directly');
select extensions.throws_ok($$select app_private.predictions_score_pending()$$, '42501', null,
  'a player cannot run the scoring job');
reset role;

-- ---------------------------------------------------------------------------
-- The switch
-- ---------------------------------------------------------------------------
select app_private.predictions_configure('off', true, '{}', pg_temp.pid(2));

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(api.predictions_round() - 'serverTime',
  '{"schemaVersion": 1, "mode": "off", "allowed": false}'::jsonb,
  'off: a visitor is told the game is off, nothing else');
select extensions.is(api.predictions_leaderboard(), '{"allowed": false, "mode": "off"}'::jsonb,
  'off: no ranking');
reset role;

set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));
select extensions.throws_ok(
  format($$select api.save_predictions('[{"fixtureId":"%s","home":1,"away":0}]')$$, pg_temp.pid(1003)),
  'PT403', 'predictions_unavailable', 'off: saving is refused');
select extensions.throws_ok($$select api.my_predictions()$$, 'PT403', 'predictions_unavailable',
  'off: my predictions are refused');
reset role;

select app_private.predictions_configure('testers', null, array[pg_temp.pid(21)]);

set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));
select extensions.ok((api.predictions_round() ->> 'allowed')::boolean, 'testers: the tester plays');
select pg_temp.as_user(pg_temp.pid(22));
select extensions.ok(not (api.predictions_round() ->> 'allowed')::boolean,
  'testers: another account sees it as off');
select extensions.throws_ok(
  format($$select api.save_predictions('[{"fixtureId":"%s","home":1,"away":0}]')$$, pg_temp.pid(1003)),
  'PT403', 'predictions_unavailable', 'testers: another account cannot save');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.ok(not (api.predictions_round() ->> 'allowed')::boolean,
  'testers: a visitor sees it as off');
reset role;

select app_private.predictions_configure('public');

-- ---------------------------------------------------------------------------
-- Reading a journée
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('test.round', api.predictions_round()::text, true);
reset role;

select extensions.is((current_setting('test.round')::jsonb -> 'round' ->> 'number')::integer, 1,
  'the default journée is the one with the next open match');
select extensions.is(current_setting('test.round')::jsonb -> 'round' ->> 'state', 'in_progress',
  'journée 1 is in progress');
select extensions.is((current_setting('test.round')::jsonb -> 'round' ->> 'provisional')::boolean, true,
  'an unfinished journée is provisional');
select extensions.is((current_setting('test.round')::jsonb -> 'round' ->> 'nextLockAt')::timestamptz,
  (select t0 + interval '1 hour' from clock), 'the next lock is the next open match''s kick-off');
select extensions.is(current_setting('test.round')::jsonb -> 'rounds',
  '[{"number": 1, "state": "in_progress"}, {"number": 2, "state": "upcoming"}]'::jsonb,
  'the switcher lists the current season''s journées with their state');
select extensions.is(jsonb_array_length(current_setting('test.round')::jsonb -> 'fixtures'), 4,
  'four matches in journée 1');
select extensions.is(
  (select jsonb_agg((item ->> 'open')::boolean order by item ->> 'kickoffAt')
   from jsonb_array_elements(current_setting('test.round')::jsonb -> 'fixtures') item),
  '[false, false, true, false]'::jsonb,
  'each match locks on its own: played, live and postponed are locked, the next one is open');
select extensions.is(pg_temp.fixture_of(current_setting('test.round')::jsonb, pg_temp.pid(1001)) -> 'result',
  '{"home": 2, "away": 1}'::jsonb, 'a final match shows its result');
select extensions.is(pg_temp.fixture_of(current_setting('test.round')::jsonb, pg_temp.pid(1002)) -> 'live',
  '{"home": 1, "away": 0}'::jsonb, 'a live match shows its running score');
select extensions.is(pg_temp.fixture_of(current_setting('test.round')::jsonb, pg_temp.pid(1002)) -> 'result',
  'null'::jsonb, 'a live match has no result yet');
select extensions.is(
  pg_temp.fixture_of(current_setting('test.round')::jsonb, pg_temp.pid(1004)) - array['id', 'kickoffAt', 'kickoffConfirmed', 'home', 'away'],
  '{"status": "postponed", "open": false, "live": null, "result": null, "final": false, "void": false, "corrected": false}'::jsonb,
  'a postponed match never shows its stored 0-0');
select extensions.is(pg_temp.fixture_of(current_setting('test.round')::jsonb, pg_temp.pid(1003)) -> 'home' ->> 'id',
  pg_temp.pid(105)::text, 'teams come with their id');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('test.round2', api.predictions_round(2, 'ar')::text, true);
select extensions.throws_ok($$select api.predictions_round(9)$$, 'PT404', 'predictions_round_not_found',
  'an unknown journée number is refused');
select extensions.throws_ok($$select api.predictions_round(1, 'en')$$, '22023', 'INVALID_LANGUAGE',
  'only fr and ar are served');
reset role;
select extensions.is(
  (select jsonb_agg(jsonb_build_object('open', item -> 'open', 'live', item -> 'live', 'result', item -> 'result'))
   from jsonb_array_elements(current_setting('test.round2')::jsonb -> 'fixtures') item),
  '[{"open": true, "live": null, "result": null}, {"open": true, "live": null, "result": null}]'::jsonb,
  'a not-started match never shows a stored score');

-- ---------------------------------------------------------------------------
-- Saving
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));

select extensions.throws_ok($$select api.save_predictions('{}')$$, 'PT400',
  'predictions_invalid_payload', 'an object is not a list');
select extensions.throws_ok($$select api.save_predictions('[]')$$, 'PT400',
  'predictions_invalid_payload', 'an empty list is refused');
select extensions.throws_ok($$select api.save_predictions(null)$$, 'PT400',
  'predictions_invalid_payload', 'null is refused');
select extensions.throws_ok(
  format($$select api.save_predictions('%s')$$, (select jsonb_agg(jsonb_build_object(
    'fixtureId', gen_random_uuid(), 'home', 1, 'away', 1)) from generate_series(1, 17))),
  'PT400', 'predictions_invalid_payload', 'seventeen items are refused (sixteen at most)');
select extensions.throws_ok(
  format($$select api.save_predictions('[{"fixtureId":"%s","home":1}]')$$, pg_temp.pid(1003)),
  'PT400', 'predictions_invalid_payload', 'a missing score is refused');
select extensions.throws_ok(
  $$select api.save_predictions('[{"home":1,"away":0}]')$$,
  'PT400', 'predictions_invalid_payload', 'a missing match id is refused');
select extensions.throws_ok(
  format($$select api.save_predictions('[{"fixtureId":"%s","home":null,"away":0}]')$$, pg_temp.pid(1003)),
  'PT400', 'predictions_invalid_payload', 'a null score is refused');
select extensions.throws_ok(
  $$select api.save_predictions('[7]')$$,
  'PT400', 'predictions_invalid_payload', 'an item that is not an object is refused');
select extensions.throws_ok(
  format($$select api.save_predictions('[{"fixtureId":"%s","home":-1,"away":0}]')$$, pg_temp.pid(1003)),
  'PT400', 'predictions_invalid_payload', 'a negative score is refused');
select extensions.throws_ok(
  format($$select api.save_predictions('[{"fixtureId":"%s","home":21,"away":0}]')$$, pg_temp.pid(1003)),
  'PT400', 'predictions_invalid_payload', 'more than 20 goals is refused');
select extensions.throws_ok(
  format($$select api.save_predictions('[{"fixtureId":"%s","home":1.5,"away":0}]')$$, pg_temp.pid(1003)),
  'PT400', 'predictions_invalid_payload', 'a fraction is refused');
select extensions.throws_ok(
  format($$select api.save_predictions('[{"fixtureId":"%s","home":"2","away":0}]')$$, pg_temp.pid(1003)),
  'PT400', 'predictions_invalid_payload', 'a score sent as text is refused');
select extensions.throws_ok(
  $$select api.save_predictions('[{"fixtureId":"not-a-uuid","home":1,"away":0}]')$$,
  'PT400', 'predictions_invalid_payload', 'a malformed match id is refused');
select extensions.throws_ok(
  format($$select api.save_predictions('[{"fixtureId":"%s","home":1,"away":0},{"fixtureId":"%s","home":2,"away":0}]')$$,
    pg_temp.pid(1003), upper(pg_temp.pid(1003)::text)),
  'PT400', 'predictions_invalid_payload', 'the same match twice is refused');

select set_config('test.saved', api.save_predictions(jsonb_build_array(
  jsonb_build_object('fixtureId', pg_temp.pid(1003), 'home', 2, 'away', 1),
  jsonb_build_object('fixtureId', pg_temp.pid(1001), 'home', 2, 'away', 1),
  jsonb_build_object('fixtureId', pg_temp.pid(1002), 'home', 1, 'away', 0),
  jsonb_build_object('fixtureId', pg_temp.pid(1004), 'home', 0, 'away', 0),
  jsonb_build_object('fixtureId', pg_temp.pid(1009), 'home', 1, 'away', 1),
  jsonb_build_object('fixtureId', gen_random_uuid(), 'home', 1, 'away', 1)
))::text, true);
select extensions.is(
  (select jsonb_agg(item.value ->> 'status' order by item.position)
   from jsonb_array_elements(current_setting('test.saved')::jsonb -> 'results')
     with ordinality as item(value, position)),
  '["saved", "locked", "locked", "locked", "not_eligible", "not_eligible"]'::jsonb,
  'one call: the open match is saved; played, live and postponed are locked; other seasons and unknown ids are not eligible');
select extensions.is(pg_temp.status_of(api.save_predictions(jsonb_build_array(
  jsonb_build_object('fixtureId', pg_temp.pid(1003), 'home', 2, 'away', 1))), pg_temp.pid(1003)),
  'unchanged', 'saving the same score again changes nothing');
select extensions.is(pg_temp.status_of(api.save_predictions(jsonb_build_array(
  jsonb_build_object('fixtureId', pg_temp.pid(1003), 'home', 3, 'away', 1))), pg_temp.pid(1003)),
  'saved', 'a new score while open replaces the old one');

select set_config('test.mine', api.my_predictions(1)::text, true);
select extensions.is((current_setting('test.mine')::jsonb -> 'items' -> 0) - 'submittedAt',
  jsonb_build_object('fixtureId', pg_temp.pid(1003), 'home', 3, 'away', 1, 'points', null, 'resultKind', null),
  'my journée shows the latest score, not yet scored');
select extensions.is(current_setting('test.mine')::jsonb -> 'summary',
  '{"predicted": 1, "total": 4, "points": 0, "exact": 0, "rank": null, "seasonPoints": 0, "seasonRank": null, "roundsPlayed": 0}'::jsonb,
  'my journée summary: one of four predicted, nothing scored yet');
select extensions.is(jsonb_array_length(api.my_predictions(null, pg_temp.pid(1003)) -> 'items'), 1,
  'one match''s prediction can be read on its own (the match page)');
select extensions.is(jsonb_array_length(api.my_predictions(null, pg_temp.pid(1009)) -> 'items'), 0,
  'a match of another season is never returned');

select extensions.is(
  (select jsonb_agg(item ->> 'status') from jsonb_array_elements(api.save_predictions(jsonb_build_array(
    jsonb_build_object('fixtureId', pg_temp.pid(1005), 'home', 0, 'away', 0),
    jsonb_build_object('fixtureId', pg_temp.pid(1006), 'home', 1, 'away', 2))) -> 'results') item),
  '["saved", "saved"]'::jsonb, 'next week''s journée can be predicted now');

-- Player 2 predicts the same match: one row each.
select pg_temp.as_user(pg_temp.pid(22));
select extensions.is(pg_temp.status_of(api.save_predictions(jsonb_build_array(
  jsonb_build_object('fixtureId', pg_temp.pid(1003), 'home', 0, 'away', 0))), pg_temp.pid(1003)),
  'saved', 'another player saves their own prediction for the same match');

-- Banned: refused by the account ban, whatever the match.
select pg_temp.as_user(pg_temp.pid(23));
select extensions.throws_ok(
  format($$select api.save_predictions('[{"fixtureId":"%s","home":1,"away":0}]')$$, pg_temp.pid(1003)),
  'PT403', 'account_banned', 'a banned account cannot save');

-- A signed-in role without an account id.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok(
  format($$select api.save_predictions('[{"fixtureId":"%s","home":1,"away":0}]')$$, pg_temp.pid(1003)),
  'PT401', 'predictions_unauthenticated', 'no account id, no save');
select extensions.throws_ok($$select api.my_predictions()$$, 'PT401', 'predictions_unauthenticated',
  'no account id, no predictions to read');
reset role;

select extensions.is(
  (select jsonb_build_object('home', home_goals, 'away', away_goals, 'homeTeam', home_team_id,
     'awayTeam', away_team_id, 'origin', origin)
   from app.predictions where user_id = pg_temp.pid(21) and fixture_id = pg_temp.pid(1003)),
  jsonb_build_object('home', 3, 'away', 1, 'homeTeam', pg_temp.pid(105), 'awayTeam', pg_temp.pid(106),
    'origin', 'direct'),
  'the stored prediction keeps the teams it was made for');
select extensions.is((select count(*)::integer from app.predictions where user_id = pg_temp.pid(23)), 0,
  'nothing was stored for the banned account');

-- The kick-off is brought forward and has now passed: the match locks at once.
update app.fixtures set kickoff_at = (select t0 - interval '1 minute' from clock),
  provider_updated_at = (select t0 from clock)
where id = pg_temp.pid(1003);
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));
select extensions.is(pg_temp.status_of(api.save_predictions(jsonb_build_array(
  jsonb_build_object('fixtureId', pg_temp.pid(1003), 'home', 0, 'away', 5))), pg_temp.pid(1003)),
  'locked', 'a kick-off moved into the past locks the match immediately');
select extensions.is(
  (select item -> 'home' from jsonb_array_elements(api.my_predictions(1) -> 'items') item
   where (item ->> 'fixtureId')::uuid = pg_temp.pid(1003)),
  '3'::jsonb, 'the refused change leaves the saved prediction as it was');
reset role;

-- A cancelled match is void on the journée page.
update app.fixtures set status = 'cancelled', provider_updated_at = (select t0 + interval '1 second' from clock)
where id = pg_temp.pid(1006);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.is(pg_temp.fixture_of(api.predictions_round(2), pg_temp.pid(1006)) -> 'void',
  'true'::jsonb, 'a cancelled match is shown as void');
reset role;

select * from extensions.finish();
rollback;
