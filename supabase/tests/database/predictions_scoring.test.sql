-- Pronostics scoring (20260925090400_predictions_scoring.sql): points only
-- for final matches, corrections, late predictions, swapped and changed teams,
-- void matches, operator overrides, standings rebuilt from predictions, shared
-- ranks, bans, idempotency, and a failed run that is rolled back and logged.
begin;
select extensions.no_plan();

create function pg_temp.pid(n integer) returns uuid language sql immutable as $$
  select ('a7400000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Players are pronos_score_1 .. pronos_score_6; keyed by that last digit.
create function pg_temp.ranks(p_round uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(right(profile.username, 1), standing.rank), '{}'::jsonb)
  from app.prediction_standings standing
  join app.profiles profile on profile.id = standing.user_id
  where standing.season_id = pg_temp.pid(3) and standing.round_id is not distinct from p_round
$$;
create function pg_temp.points(p_round uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(right(profile.username, 1), standing.points), '{}'::jsonb)
  from app.prediction_standings standing
  join app.profiles profile on profile.id = standing.user_id
  where standing.season_id = pg_temp.pid(3) and standing.round_id is not distinct from p_round
$$;
create function pg_temp.kinds(p_fixture uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(right(profile.username, 1),
    coalesce(prediction.result_kind || ':' || prediction.points, 'unscored')), '{}'::jsonb)
  from app.predictions prediction
  join app.profiles profile on profile.id = prediction.user_id
  where prediction.fixture_id = p_fixture
$$;
create function pg_temp.score() returns jsonb language sql volatile as $$
  select app_private.predictions_score_pending(statement_timestamp(), 50)
$$;

create temporary table clock on commit drop as
select date_trunc('second', statement_timestamp()) as t0;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.pid(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.pid(2), 'pronostics-scoring-test', 'Pronostics Scoring Test', 'PST', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.pid(3), pg_temp.pid(2), 'Current', current_date - 60, current_date + 300, 'active', true);
insert into app.rounds (id, season_id, round_number, name) values
  (pg_temp.pid(11), pg_temp.pid(3), 1, 'Journée 1'),
  (pg_temp.pid(12), pg_temp.pid(3), 2, 'Journée 2');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.pid(100 + n), 'pronos-score-club-' || n, 'Score Club ' || n, 'SC' || n, 'S' || n,
  (select id from app.countries where iso_alpha2 = 'MA')
from generate_series(1, 16) n;

-- Journée 1: S1 final 2-1; S2 full time 0-0 but not final yet; S3 postponed
-- with a stored 0-0; S4 cancelled. Journée 2: S5 final 1-1; S6 final 3-0
-- between teams 111 and 112 (the players predicted it when it was 113 v 114);
-- S7 final 2-2.
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, finalized_at, provider_updated_at)
select v.id, pg_temp.pid(2), pg_temp.pid(3), v.round_id, v.home, v.away, clock.t0 + v.kickoff,
  v.status::app.fixture_status, v.home_score, v.away_score,
  case when v.final then clock.t0 - interval '5 minutes' end, clock.t0 - interval '1 minute'
from clock cross join (values
  (pg_temp.pid(1001), pg_temp.pid(11), pg_temp.pid(101), pg_temp.pid(102), interval '-3 hours', 'finished', 2, 1, true),
  (pg_temp.pid(1002), pg_temp.pid(11), pg_temp.pid(103), pg_temp.pid(104), interval '-8 hours', 'finished', 0, 0, false),
  (pg_temp.pid(1003), pg_temp.pid(11), pg_temp.pid(105), pg_temp.pid(106), interval '2 days', 'postponed', 0, 0, false),
  (pg_temp.pid(1004), pg_temp.pid(11), pg_temp.pid(107), pg_temp.pid(108), interval '-1 day', 'cancelled', null, null, false),
  (pg_temp.pid(1005), pg_temp.pid(12), pg_temp.pid(109), pg_temp.pid(110), interval '-2 hours', 'finished', 1, 1, true),
  (pg_temp.pid(1006), pg_temp.pid(12), pg_temp.pid(111), pg_temp.pid(112), interval '-2 hours', 'finished', 3, 0, true),
  (pg_temp.pid(1007), pg_temp.pid(12), pg_temp.pid(115), pg_temp.pid(116), interval '-2 hours', 'finished', 2, 2, true)
) as v(id, round_id, home, away, kickoff, status, home_score, away_score, final);

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.pid(20 + n), '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'pronos-score-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'pronos_score_' || n), statement_timestamp(), statement_timestamp()
from generate_series(1, 6) n;
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.pid(29), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'pronos-score-staff@example.test', statement_timestamp(), 'hash', '{}',
  '{"username":"pronos_staff_s"}', statement_timestamp(), statement_timestamp());
insert into app_private.staff_principals (id, auth_user_id) values (pg_temp.pid(30), pg_temp.pid(29));

-- Predictions as the app would have stored them: made the day before, with
-- the teams the player saw. Player 4 saved S1 a minute after its kick-off
-- (the kick-off had been brought forward and the database learned it late).
-- Player 5 saw S1 the other way round and predicted 1-2 for team 102.
insert into app.predictions (user_id, fixture_id, home_goals, away_goals, home_team_id,
  away_team_id, submitted_at)
select pg_temp.pid(20 + v.player), pg_temp.pid(v.fixture), v.home, v.away,
  pg_temp.pid(v.home_team), pg_temp.pid(v.away_team), clock.t0 + v.submitted
from clock cross join (values
  (1, 1001, 2, 1, 101, 102, interval '-1 day'),
  (2, 1001, 1, 0, 101, 102, interval '-1 day'),
  (3, 1001, 0, 2, 101, 102, interval '-1 day'),
  (4, 1001, 2, 1, 101, 102, interval '-2 hours 59 minutes'),
  (5, 1001, 1, 2, 102, 101, interval '-1 day'),
  (1, 1002, 0, 0, 103, 104, interval '-1 day'),
  (1, 1003, 0, 0, 105, 106, interval '-1 day'),
  (2, 1003, 1, 1, 105, 106, interval '-1 day'),
  (1, 1004, 1, 0, 107, 108, interval '-2 days'),
  (1, 1005, 1, 1, 109, 110, interval '-1 day'),
  (2, 1005, 2, 2, 109, 110, interval '-1 day'),
  (3, 1005, 0, 0, 109, 110, interval '-1 day'),
  (1, 1006, 2, 0, 113, 114, interval '-1 day'),
  (6, 1007, 2, 2, 115, 116, interval '-1 day')
) as v(player, fixture, home, away, home_team, away_team, submitted);

-- ---------------------------------------------------------------------------
-- Off: nothing happens
-- ---------------------------------------------------------------------------
select app_private.predictions_configure('off', true, '{}', pg_temp.pid(2));
select extensions.is(pg_temp.score(), '{"outcome": "disabled"}'::jsonb, 'off: the job does nothing');
select app_private.predictions_configure('testers', false);
select extensions.is(pg_temp.score(), '{"outcome": "disabled"}'::jsonb,
  'scoring paused: the job does nothing, even with testers playing');
select extensions.is((select count(*)::integer from app.predictions where scored_at is not null), 0,
  'nothing was scored while off or paused');
select app_private.predictions_configure('public', true);

-- ---------------------------------------------------------------------------
-- First pass
-- ---------------------------------------------------------------------------
select set_config('test.first', pg_temp.score()::text, true);
select extensions.is(current_setting('test.first')::jsonb ->> 'outcome', 'succeeded', 'the first pass works');
select extensions.is(
  (select jsonb_agg(value order by value) from jsonb_array_elements_text(current_setting('test.first')::jsonb -> 'fixtureIds')),
  (select jsonb_agg(id::text order by id::text) from app.fixtures
   where id in (pg_temp.pid(1001), pg_temp.pid(1004), pg_temp.pid(1005), pg_temp.pid(1006), pg_temp.pid(1007))),
  'final and cancelled matches are handled; full time without the final flag and postponed are not');

select extensions.is(pg_temp.kinds(pg_temp.pid(1001)),
  '{"1": "exact:3", "2": "outcome:1", "3": "miss:0", "4": "late:0", "5": "exact:3"}'::jsonb,
  'S1 2-1: exact 3, outcome 1, miss 0, saved after kick-off 0, swapped teams still exact');
select extensions.is(pg_temp.kinds(pg_temp.pid(1002)), '{"1": "unscored"}'::jsonb,
  'full time without finalized_at is not scored, even at 0-0');
select extensions.is(pg_temp.kinds(pg_temp.pid(1003)), '{"1": "unscored", "2": "unscored"}'::jsonb,
  'a postponed match''s stored 0-0 is never scored');
select extensions.is(pg_temp.kinds(pg_temp.pid(1004)), '{"1": "void:0"}'::jsonb, 'a cancelled match is void');
select extensions.is(pg_temp.kinds(pg_temp.pid(1005)), '{"1": "exact:3", "2": "outcome:1", "3": "outcome:1"}'::jsonb,
  'S5 1-1: a draw predicted with another score is the right outcome');
select extensions.is(pg_temp.kinds(pg_temp.pid(1006)), '{"1": "void:0"}'::jsonb,
  'a prediction made for other teams is void');

select extensions.is(pg_temp.points(pg_temp.pid(11)),
  '{"1": 3, "2": 1, "3": 0, "4": 0, "5": 3}'::jsonb, 'journée 1 points');
select extensions.is(pg_temp.ranks(pg_temp.pid(11)),
  '{"1": 1, "2": 3, "3": 4, "4": null, "5": 1}'::jsonb,
  'journée 1 ranks: equal points and exact scores share a rank; nothing scored, no rank');
select extensions.is(pg_temp.ranks(pg_temp.pid(12)),
  '{"1": 1, "2": 3, "3": 3, "6": 1}'::jsonb, 'journée 2 ranks');
select extensions.is(pg_temp.points(null),
  '{"1": 6, "2": 2, "3": 1, "4": 0, "5": 3, "6": 3}'::jsonb, 'season points');
select extensions.is(pg_temp.ranks(null),
  '{"1": 1, "2": 4, "3": 5, "4": null, "5": 2, "6": 2}'::jsonb, 'season ranks');
select extensions.is(
  (select jsonb_build_object('points', points, 'exact', exact_count, 'outcome', outcome_count,
     'miss', miss_count, 'void', void_count, 'scored', scored_count, 'predicted', predicted_count,
     'rounds', rounds_played)
   from app.prediction_standings where user_id = pg_temp.pid(21) and round_id is null),
  '{"points": 6, "exact": 2, "outcome": 0, "miss": 0, "void": 2, "scored": 2, "predicted": 6, "rounds": 2}'::jsonb,
  'player 1''s season row: void and unscored matches count as predicted, not as scored');
select extensions.is(
  (select jsonb_build_object('points', points, 'void', void_count, 'scored', scored_count, 'rounds', rounds_played)
   from app.prediction_standings where user_id = pg_temp.pid(24) and round_id is null),
  '{"points": 0, "void": 1, "scored": 0, "rounds": 0}'::jsonb,
  'a late prediction scores nothing and counts no journée played');
select extensions.is(
  (select jsonb_build_object('state', state, 'home', result_home, 'away', result_away,
     'revision', revision, 'scored', predictions_scored, 'corrected', corrected_at is not null)
   from app_private.prediction_fixture_scoring where fixture_id = pg_temp.pid(1001)),
  '{"state": "scored", "home": 2, "away": 1, "revision": 1, "scored": 5, "corrected": false}'::jsonb,
  'what was scored is recorded per match');

-- ---------------------------------------------------------------------------
-- Idempotent
-- ---------------------------------------------------------------------------
select set_config('test.runs', (select count(*)::text from app_private.prediction_job_runs where kind = 'tick'), true);
select set_config('test.updated', (select max(updated_at)::text from app.prediction_standings), true);
select extensions.is(pg_temp.score(), '{"outcome": "idle"}'::jsonb, 'a second pass with nothing new is idle');
select extensions.is((select count(*)::text from app_private.prediction_job_runs where kind = 'tick'),
  current_setting('test.runs'), 'an idle pass writes no log row');
select extensions.is((select max(updated_at)::text from app.prediction_standings),
  current_setting('test.updated'), 'an idle pass rewrites no standing');

-- ---------------------------------------------------------------------------
-- S2 becomes final
-- ---------------------------------------------------------------------------
select extensions.is(
  (select jsonb_agg(item ->> 'fixtureId') from jsonb_array_elements(app_private.predictions_status() -> 'waitingForFinal') item),
  jsonb_build_array(pg_temp.pid(1002)::text),
  'the status report lists a predicted match stuck at full time without the final flag');
update app.fixtures set finalized_at = (select t0 - interval '1 minute' from clock),
  provider_updated_at = (select t0 from clock)
where id = pg_temp.pid(1002);
select extensions.is(pg_temp.score() -> 'fixtureIds', jsonb_build_array(pg_temp.pid(1002)::text),
  'the next pass picks up the newly final match only');
select extensions.is(pg_temp.kinds(pg_temp.pid(1002)), '{"1": "exact:3"}'::jsonb, 'S2 0-0 scored once final');
select extensions.is(pg_temp.points(null) -> '1', '9'::jsonb, 'player 1''s season total follows');

-- ---------------------------------------------------------------------------
-- A provider correction: S1 was 1-0, not 2-1
-- ---------------------------------------------------------------------------
update app.fixtures set home_score = 1, away_score = 0,
  provider_updated_at = (select t0 + interval '1 second' from clock)
where id = pg_temp.pid(1001);
select extensions.is(pg_temp.score() -> 'fixtureIds', jsonb_build_array(pg_temp.pid(1001)::text),
  'a corrected score is re-scored');
select extensions.is(pg_temp.kinds(pg_temp.pid(1001)),
  '{"1": "outcome:1", "2": "exact:3", "3": "miss:0", "4": "late:0", "5": "outcome:1"}'::jsonb,
  'every prediction of S1 is scored again against 1-0');
select extensions.is(
  (select jsonb_build_object('home', result_home, 'away', result_away, 'revision', revision,
     'corrected', corrected_at is not null)
   from app_private.prediction_fixture_scoring where fixture_id = pg_temp.pid(1001)),
  '{"home": 1, "away": 0, "revision": 2, "corrected": true}'::jsonb, 'the correction is recorded');
select extensions.is(pg_temp.ranks(pg_temp.pid(11)),
  '{"1": 1, "2": 2, "3": 4, "4": null, "5": 3}'::jsonb,
  'journée 1 re-ranked: player 1 has 4 (S1 outcome + S2 exact), player 2 has 3');
select app_private.predictions_configure('public');
select extensions.is(
  (select item -> 'corrected' from jsonb_array_elements(api.predictions_round(1) -> 'fixtures') item
   where (item ->> 'id')::uuid = pg_temp.pid(1001)),
  'true'::jsonb, 'the journée page flags the corrected result');

-- ---------------------------------------------------------------------------
-- Operator: void, then unvoid
-- ---------------------------------------------------------------------------
select extensions.throws_ok(
  format($$select app_private.predictions_void_fixture('%s', 'short')$$, pg_temp.pid(1005)),
  '22023', 'predictions_reason_invalid', 'a void needs a real reason');
select app_private.predictions_void_fixture(pg_temp.pid(1005), 'Awarded 3-0 by the league.');
select extensions.is(pg_temp.score() -> 'fixtureIds', jsonb_build_array(pg_temp.pid(1005)::text),
  'the void is applied on the next pass');
select extensions.is(pg_temp.kinds(pg_temp.pid(1005)), '{"1": "void:0", "2": "void:0", "3": "void:0"}'::jsonb,
  'a voided match scores nothing for anyone');
select extensions.is(pg_temp.ranks(pg_temp.pid(12)), '{"1": null, "2": null, "3": null, "6": 1}'::jsonb,
  'players left with nothing scored in the journée lose their journée rank');
select app_private.predictions_unvoid_fixture(pg_temp.pid(1005), 'League reversed its decision.');
select extensions.throws_ok(
  format($$select app_private.predictions_unvoid_fixture('%s', 'Nothing to reverse here.')$$, pg_temp.pid(1005)),
  'P0002', 'predictions_override_not_found', 'only an override can be reversed');
select pg_temp.score();
select extensions.is(pg_temp.kinds(pg_temp.pid(1005)), '{"1": "exact:3", "2": "outcome:1", "3": "outcome:1"}'::jsonb,
  'unvoided: scored again from the match''s own result');
select extensions.is(pg_temp.ranks(pg_temp.pid(12)), '{"1": 1, "2": 3, "3": 3, "6": 1}'::jsonb,
  'journée 2 ranks restored');
select extensions.is(
  (select count(*)::integer from app_private.prediction_job_runs
   where kind = 'operator' and detail ->> 'action' in ('void_fixture', 'unvoid_fixture') and reason is not null),
  2, 'both operator actions are logged with their reason');

-- ---------------------------------------------------------------------------
-- A match moves to another journée
-- ---------------------------------------------------------------------------
update app.fixtures set round_id = pg_temp.pid(11),
  provider_updated_at = (select t0 + interval '2 seconds' from clock)
where id = pg_temp.pid(1007);
select pg_temp.score();
select extensions.ok(not exists (
  select 1 from app.prediction_standings where user_id = pg_temp.pid(26) and round_id = pg_temp.pid(12)),
  'a journée row left without predictions is removed');
select extensions.is(pg_temp.points(pg_temp.pid(11)) -> '6', '3'::jsonb,
  'the points follow the match into its new journée');
select extensions.is(pg_temp.ranks(pg_temp.pid(11)),
  '{"1": 1, "2": 2, "3": 5, "4": null, "5": 4, "6": 2}'::jsonb, 'journée 1 re-ranked with the moved match');
select extensions.is(pg_temp.ranks(pg_temp.pid(12)), '{"1": 1, "2": 2, "3": 2}'::jsonb,
  'journée 2 re-ranked without it');

-- ---------------------------------------------------------------------------
-- Bans and deleted accounts are unranked at the next re-rank
-- ---------------------------------------------------------------------------
insert into app_private.user_bans (user_id, banned_by_principal_id, reason)
values (pg_temp.pid(25), pg_temp.pid(30), 'Offensive display name.');
update app.profiles set deleted_at = statement_timestamp() where id = pg_temp.pid(23);
select extensions.throws_ok(
  format($$select app_private.predictions_rescore_fixture('%s', 'short')$$, pg_temp.pid(1001)),
  '22023', 'predictions_reason_invalid', 'a re-score needs a real reason');
select app_private.predictions_rescore_fixture(pg_temp.pid(1001), 'Re-rank after moderation.');
select pg_temp.score();
select extensions.is(pg_temp.ranks(pg_temp.pid(11)),
  '{"1": 1, "2": 2, "3": null, "4": null, "5": null, "6": 2}'::jsonb,
  'a banned player and a deleted account are unranked, the others close up');
select extensions.is(pg_temp.ranks(null),
  '{"1": 1, "2": 2, "3": null, "4": null, "5": null, "6": 3}'::jsonb, 'the season too');
select extensions.is(pg_temp.points(pg_temp.pid(11)) -> '5', '1'::jsonb,
  'a banned player keeps their points; only the rank goes');

-- ---------------------------------------------------------------------------
-- A failed pass is rolled back and logged
-- ---------------------------------------------------------------------------
create function app_private.pronostics_test_refuse() returns trigger language plpgsql as $$
begin
  raise exception 'simulated failure';
end;
$$;
create trigger pronostics_test_refuse before update on app.predictions
for each row execute function app_private.pronostics_test_refuse();
update app.fixtures set home_score = 2, away_score = 2,
  provider_updated_at = (select t0 + interval '3 seconds' from clock)
where id = pg_temp.pid(1005);
select extensions.is(app_private.predictions_score_tick(), '{"outcome": "failed"}'::jsonb,
  'the tick reports a failed pass instead of raising');
select extensions.is(
  (select error from app_private.prediction_job_runs where outcome = 'failed' order by id desc limit 1),
  'P0001: simulated failure', 'the failure is logged with its error');
select extensions.is(
  (select jsonb_build_object('home', result_home, 'away', result_away)
   from app_private.prediction_fixture_scoring where fixture_id = pg_temp.pid(1005)),
  '{"home": 1, "away": 1}'::jsonb, 'nothing of the failed pass was kept');
drop trigger pronostics_test_refuse on app.predictions;
drop function app_private.pronostics_test_refuse();
select extensions.is(app_private.predictions_score_tick() -> 'fixtureIds',
  jsonb_build_array(pg_temp.pid(1005)::text), 'the next tick retries and succeeds');
select extensions.is(pg_temp.kinds(pg_temp.pid(1005)), '{"1": "outcome:1", "2": "exact:3", "3": "outcome:1"}'::jsonb,
  'S5 corrected to 2-2');

select * from extensions.finish();
rollback;
