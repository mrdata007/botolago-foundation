-- Pronostics: importing the predictions a visitor made on the phone before
-- signing up (api.claim_guest_predictions, 20260925090200).
--
-- The account always wins over the phone, nothing is imported for a match
-- that is no longer open, goals follow the teams, and running it twice
-- changes nothing.
begin;
select extensions.no_plan();

create function pg_temp.pid(n integer) returns uuid language sql immutable as $$
  select ('a7300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated","aal":"aal1"}', p_id), true)
$$;
create function pg_temp.item(p_fixture uuid, p_home integer, p_away integer,
  p_home_team uuid default null, p_away_team uuid default null) returns jsonb
language sql immutable as $$
  select jsonb_build_object('fixtureId', p_fixture, 'home', p_home, 'away', p_away)
    || case when p_home_team is null then '{}'::jsonb
       else jsonb_build_object('homeTeamId', p_home_team, 'awayTeamId', p_away_team) end
$$;

create temporary table clock on commit drop as
select date_trunc('second', statement_timestamp()) as t0;

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.pid(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.pid(2), 'pronostics-claim-test', 'Pronostics Claim Test', 'PCT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values
  (pg_temp.pid(3), pg_temp.pid(2), 'Current', current_date - 60, current_date + 300, 'active', true),
  (pg_temp.pid(4), pg_temp.pid(2), 'Previous', current_date - 420, current_date - 61, 'completed', false);
insert into app.rounds (id, season_id, round_number, name) values
  (pg_temp.pid(11), pg_temp.pid(3), 1, 'Journée 1'),
  (pg_temp.pid(19), pg_temp.pid(4), 30, 'Journée 30');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.pid(100 + n), 'pronos-claim-club-' || n, 'Claim Club ' || n, 'CC' || n, 'C' || n,
  (select id from app.countries where iso_alpha2 = 'MA')
from generate_series(1, 12) n;

-- G1, G2, G4, G6 open tomorrow; G3 kicked off an hour ago; G5 last season.
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, provider_updated_at)
select v.id, pg_temp.pid(2), v.season_id, v.round_id, v.home, v.away, clock.t0 + v.kickoff,
  v.status::app.fixture_status, v.home_score, v.away_score, clock.t0 - interval '1 day'
from clock cross join (values
  (pg_temp.pid(1001), pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(101), pg_temp.pid(102),
    interval '1 day', 'not_started', null::integer, null::integer),
  (pg_temp.pid(1002), pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(103), pg_temp.pid(104),
    interval '1 day 2 hours', 'not_started', null, null),
  (pg_temp.pid(1003), pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(105), pg_temp.pid(106),
    interval '-1 hour', 'live_second_half', 0, 0),
  (pg_temp.pid(1004), pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(107), pg_temp.pid(108),
    interval '1 day 4 hours', 'not_started', null, null),
  (pg_temp.pid(1005), pg_temp.pid(4), pg_temp.pid(19), pg_temp.pid(101), pg_temp.pid(103),
    interval '2 days', 'not_started', null, null),
  (pg_temp.pid(1006), pg_temp.pid(3), pg_temp.pid(11), pg_temp.pid(109), pg_temp.pid(110),
    interval '1 day 6 hours', 'not_started', null, null)
) as v(id, season_id, round_id, home, away, kickoff, status, home_score, away_score);

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.pid(20 + n), '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'pronos-claim-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'pronos_claim_' || n), statement_timestamp(), statement_timestamp()
from generate_series(1, 2) n;

select app_private.predictions_configure('public', true, '{}', pg_temp.pid(2));

-- The account already predicted G2 1-1 on another device.
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));
select api.save_predictions(jsonb_build_array(pg_temp.item(pg_temp.pid(1002), 1, 1)));

-- The phone's list. G4: the guest saw the teams the other way round (the
-- provider swapped home and away since) and predicted 2-1 for team 108.
select set_config('test.claim', api.claim_guest_predictions(jsonb_build_array(
  pg_temp.item(pg_temp.pid(1001), 2, 0, pg_temp.pid(101), pg_temp.pid(102)),
  pg_temp.item(pg_temp.pid(1002), 3, 3, pg_temp.pid(103), pg_temp.pid(104)),
  pg_temp.item(pg_temp.pid(1003), 1, 0, pg_temp.pid(105), pg_temp.pid(106)),
  pg_temp.item(pg_temp.pid(1004), 2, 1, pg_temp.pid(108), pg_temp.pid(107)),
  pg_temp.item(pg_temp.pid(1005), 1, 1, pg_temp.pid(101), pg_temp.pid(103)),
  pg_temp.item(gen_random_uuid(), 1, 1),
  pg_temp.item(pg_temp.pid(1006), 0, 0, pg_temp.pid(101), pg_temp.pid(102))
))::text, true);
reset role;

select extensions.is(
  (select jsonb_agg(item ->> 'status') from jsonb_array_elements(current_setting('test.claim')::jsonb -> 'results') item),
  '["imported", "kept", "started", "imported", "invalid", "invalid", "invalid"]'::jsonb,
  'open matches are imported, the account''s own prediction is kept, a started match is refused, anything else is invalid');
select extensions.is(current_setting('test.claim')::jsonb - array['serverTime', 'results'],
  '{"imported": 2, "keptExisting": 1, "started": 1, "invalid": 3}'::jsonb, 'the counts add up');

select extensions.is(
  (select jsonb_build_object('home', home_goals, 'away', away_goals, 'origin', origin)
   from app.predictions where user_id = pg_temp.pid(21) and fixture_id = pg_temp.pid(1001)),
  '{"home": 2, "away": 0, "origin": "guest_claim"}'::jsonb, 'an imported prediction is marked as coming from the phone');
select extensions.is(
  (select jsonb_build_object('home', home_goals, 'away', away_goals, 'origin', origin)
   from app.predictions where user_id = pg_temp.pid(21) and fixture_id = pg_temp.pid(1002)),
  '{"home": 1, "away": 1, "origin": "direct"}'::jsonb, 'the account''s own prediction wins over the phone');
select extensions.is(
  (select jsonb_build_object('home', home_goals, 'away', away_goals, 'homeTeam', home_team_id)
   from app.predictions where user_id = pg_temp.pid(21) and fixture_id = pg_temp.pid(1004)),
  jsonb_build_object('home', 1, 'away', 2, 'homeTeam', pg_temp.pid(107)),
  'goals follow the teams: team 108''s two goals are stored as the away score');
select extensions.is(
  (select count(*)::integer from app.predictions
   where user_id = pg_temp.pid(21) and fixture_id in (pg_temp.pid(1003), pg_temp.pid(1005), pg_temp.pid(1006))),
  0, 'nothing is stored for a started match, another season or different teams');

select extensions.is(
  (select jsonb_build_object('submitted', submitted, 'imported', imported, 'kept', kept_existing,
     'started', rejected_started, 'invalid', rejected_invalid)
   from app_private.prediction_guest_claims where user_id = pg_temp.pid(21)),
  '{"submitted": 7, "imported": 2, "kept": 1, "started": 1, "invalid": 3}'::jsonb,
  'the import is logged with its counts only');

-- The same list again (a retry after a lost response): nothing changes.
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(21));
select set_config('test.again', api.claim_guest_predictions(jsonb_build_array(
  pg_temp.item(pg_temp.pid(1001), 5, 5, pg_temp.pid(101), pg_temp.pid(102)),
  pg_temp.item(pg_temp.pid(1002), 3, 3, pg_temp.pid(103), pg_temp.pid(104)),
  pg_temp.item(pg_temp.pid(1003), 1, 0, pg_temp.pid(105), pg_temp.pid(106)),
  pg_temp.item(pg_temp.pid(1004), 2, 1, pg_temp.pid(108), pg_temp.pid(107)),
  pg_temp.item(pg_temp.pid(1005), 1, 1, pg_temp.pid(101), pg_temp.pid(103)),
  pg_temp.item(gen_random_uuid(), 1, 1),
  pg_temp.item(pg_temp.pid(1006), 0, 0, pg_temp.pid(101), pg_temp.pid(102))
))::text, true);
reset role;
select extensions.is(current_setting('test.again')::jsonb - array['serverTime', 'results'],
  '{"imported": 0, "keptExisting": 3, "started": 1, "invalid": 3}'::jsonb,
  'a second import changes nothing: everything imported the first time is now the account''s');
select extensions.is(
  (select home_goals::integer from app.predictions where user_id = pg_temp.pid(21) and fixture_id = pg_temp.pid(1001)),
  2, 'a second import does not overwrite');
select extensions.is((select count(*)::integer from app_private.prediction_guest_claims), 2,
  'each import is logged');

-- Without team ids (an older phone): imported as sent.
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(22));
select extensions.is(
  api.claim_guest_predictions(jsonb_build_array(pg_temp.item(pg_temp.pid(1006), 4, 0))) -> 'results' -> 0 ->> 'status',
  'imported', 'an item without team ids is imported as sent');

-- Limits and validation.
select extensions.throws_ok(
  format($$select api.claim_guest_predictions('%s')$$, (select jsonb_agg(jsonb_build_object(
    'fixtureId', gen_random_uuid(), 'home', 1, 'away', 1)) from generate_series(1, 41))),
  'PT400', 'predictions_invalid_payload', 'forty-one items are refused (forty at most)');
select extensions.throws_ok(
  format($$select api.claim_guest_predictions('[{"fixtureId":"%s","home":1,"away":1,"homeTeamId":"x","awayTeamId":null}]')$$,
    pg_temp.pid(1006)),
  'PT400', 'predictions_invalid_payload', 'malformed team ids are refused');
reset role;

-- The switch applies to the import too.
select app_private.predictions_configure('testers', null, array[pg_temp.pid(21)]);
set local role authenticated;
select pg_temp.as_user(pg_temp.pid(22));
select extensions.throws_ok(
  format($$select api.claim_guest_predictions('[{"fixtureId":"%s","home":1,"away":1}]')$$, pg_temp.pid(1001)),
  'PT403', 'predictions_unavailable', 'an account outside the testers cannot import');
reset role;

select * from extensions.finish();
rollback;
