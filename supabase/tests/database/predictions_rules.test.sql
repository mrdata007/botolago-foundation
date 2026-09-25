-- Pronostics rules (20260925090100_predictions_rules.sql): the 3/1/0 points,
-- the per-match lock, the default journée and the journée state. Every
-- function takes an explicit "now", so the boundaries are exact.
begin;
select extensions.no_plan();

create function pg_temp.pid(n integer) returns uuid language sql immutable as $$
  select ('a7100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

-- ---------------------------------------------------------------------------
-- Points, rule v1
-- ---------------------------------------------------------------------------
select extensions.is(app_private.prediction_points(2, 1, 2, 1), 3, 'exact score: 3');
select extensions.is(app_private.prediction_points(0, 0, 0, 0), 3, 'exact goalless draw: 3');
select extensions.is(app_private.prediction_points(3, 1, 1, 0), 1, 'right home win, wrong score: 1');
select extensions.is(app_private.prediction_points(1, 1, 2, 2), 1, 'right draw, wrong score: 1');
select extensions.is(app_private.prediction_points(0, 2, 1, 3), 1, 'right away win, wrong score: 1');
select extensions.is(app_private.prediction_points(1, 0, 0, 1), 0, 'wrong outcome: 0');
select extensions.is(app_private.prediction_points(1, 1, 1, 0), 0, 'a draw against a home win: 0');
select extensions.is(app_private.prediction_points(2, 0, 0, 0), 0, 'a home win against a draw: 0');
select extensions.is(app_private.prediction_points(7, 3, 7, 3), 3, 'a high exact score: 3');
select extensions.is(app_private.prediction_points(5, 4, 1, 0), 1, 'a high score, right outcome: 1');
-- The same cases as src/backend/predictions/scoring-cases.ts; a new case goes in both.
select extensions.is(app_private.prediction_result_kind(2, 1, 2, 1), 'exact', 'kind exact');
select extensions.is(app_private.prediction_result_kind(2, 0, 1, 0), 'outcome', 'kind outcome');
select extensions.is(app_private.prediction_result_kind(0, 1, 1, 0), 'miss', 'kind miss');

-- ---------------------------------------------------------------------------
-- The lock: status scheduled / not_started AND strictly before kick-off
-- ---------------------------------------------------------------------------
select extensions.ok(app_private.prediction_fixture_open('not_started',
  '2095-09-20 18:00Z', '2095-09-20 17:59:59.999999Z'), 'open one microsecond before kick-off');
select extensions.ok(not app_private.prediction_fixture_open('not_started',
  '2095-09-20 18:00Z', '2095-09-20 18:00Z'), 'locked exactly at kick-off');
select extensions.ok(not app_private.prediction_fixture_open('not_started',
  '2095-09-20 18:00Z', '2095-09-20 18:00:01Z'), 'locked after kick-off');
select extensions.ok(app_private.prediction_fixture_open('scheduled',
  '2095-09-20 18:00Z', '2095-09-19 12:00Z'), 'a scheduled match is open before kick-off');
select extensions.ok(not app_private.prediction_fixture_open('postponed',
  '2095-09-20 18:00Z', '2095-09-19 12:00Z'), 'a postponed match is locked even before its old kick-off');
select extensions.ok(not app_private.prediction_fixture_open('delayed',
  '2095-09-20 18:00Z', '2095-09-20 17:00Z'), 'a delayed match is locked');
select extensions.ok(not app_private.prediction_fixture_open('live_first_half',
  '2095-09-20 18:00Z', '2095-09-20 17:00Z'), 'a match reported live is locked whatever its kick-off says');
select extensions.ok(not app_private.prediction_fixture_open('cancelled',
  '2095-09-20 18:00Z', '2095-09-19 12:00Z'), 'a cancelled match is locked');
select extensions.ok(not app_private.prediction_fixture_open(null,
  '2095-09-20 18:00Z', '2095-09-19 12:00Z'), 'an unknown status is locked, not null');
select extensions.ok(not app_private.prediction_fixture_open('not_started',
  '2095-09-20 00:00Z', '2095-09-20 00:30Z'),
  'a placeholder midnight kick-off locks at the start of match day');

-- ---------------------------------------------------------------------------
-- A season with four journées
-- ---------------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.pid(1), 'MA', 'MAR')
on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.pid(2), 'pronostics-rules-test', 'Pronostics Rules Test', 'PRT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.pid(3), pg_temp.pid(2), '2095/96', '2095-08-01', '2096-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name)
select pg_temp.pid(10 + n), pg_temp.pid(3), n, 'Journée ' || n from generate_series(1, 4) n;
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.pid(100 + n), 'pronos-rules-club-' || n, 'Rules Club ' || n, 'RC' || n, 'R' || n,
  (select id from app.countries where iso_alpha2 = 'MA')
from generate_series(1, 8) n;

-- Four matches per journée, a week apart from 2095-09-06 18:00Z.
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, provider_updated_at)
select pg_temp.pid(1000 + r * 10 + m), pg_temp.pid(2), pg_temp.pid(3), pg_temp.pid(10 + r),
  pg_temp.pid(100 + m * 2 - 1), pg_temp.pid(100 + m * 2),
  timestamptz '2095-09-06 18:00Z' + make_interval(days => (r - 1) * 7, hours => m - 1),
  'not_started', '2095-08-01 00:00Z'
from generate_series(1, 4) r cross join generate_series(1, 4) m;

select app_private.predictions_configure('public', true, null, pg_temp.pid(2));

select extensions.is(app_private.predictions_current_season(), pg_temp.pid(3),
  'the configured competition''s current season is played');

-- Before anything: journée 1.
select extensions.is(app_private.predictions_current_round(pg_temp.pid(3), '2095-09-01 12:00Z'),
  pg_temp.pid(11), 'before the season the first journée opens');
select extensions.is(app_private.prediction_round_state(pg_temp.pid(11), '2095-09-01 12:00Z'),
  'upcoming', 'a journée with no kick-off yet is upcoming');

-- During journée 1, after two of its matches kicked off: still journée 1.
select extensions.is(app_private.predictions_current_round(pg_temp.pid(3), '2095-09-06 19:30Z'),
  pg_temp.pid(11), 'a journée stays current while it has an open match');
select extensions.is(app_private.prediction_round_state(pg_temp.pid(11), '2095-09-06 19:30Z'),
  'in_progress', 'a journée with some matches played is in progress');

-- Journée 1 done (no open match): journée 2 opens.
select extensions.is(app_private.predictions_current_round(pg_temp.pid(3), '2095-09-07 12:00Z'),
  pg_temp.pid(12), 'once a journée has no open match the next one opens');

-- A leftover: one journée-1 match postponed to the week after journée 2.
update app.fixtures set status = 'postponed', provider_updated_at = '2095-09-05 00:00Z'
where id = pg_temp.pid(1014);
select extensions.is(app_private.prediction_round_state(pg_temp.pid(11), '2095-09-07 12:00Z'),
  'in_progress', 'a journée with a postponed match and others unfinished is in progress');
update app.fixtures set status = 'finished', home_score = 1, away_score = 0,
  finalized_at = kickoff_at + interval '2 hours', provider_updated_at = '2095-09-07 00:00Z'
where id in (pg_temp.pid(1011), pg_temp.pid(1012), pg_temp.pid(1013));
select extensions.is(app_private.prediction_round_state(pg_temp.pid(11), '2095-09-07 12:00Z'),
  'provisional', 'every match final except a postponed one: provisional');
update app.fixtures set status = 'not_started', kickoff_at = '2095-09-17 18:00Z',
  provider_updated_at = '2095-09-08 00:00Z'
where id = pg_temp.pid(1014);
-- Journée 2 has kicked off entirely by 2095-09-14; the leftover is open but
-- journée 3 must open, not the leftover's journée 1.
select extensions.is(app_private.predictions_current_round(pg_temp.pid(3), '2095-09-15 12:00Z'),
  pg_temp.pid(13), 'a rescheduled leftover does not drag the page back to its old journée');

-- An early bird: one journée-4 match brought forward before journée 3.
update app.fixtures set kickoff_at = '2095-09-19 12:00Z', provider_updated_at = '2095-09-09 00:00Z'
where id = pg_temp.pid(1041);
select extensions.is(app_private.predictions_current_round(pg_temp.pid(3), '2095-09-15 12:00Z'),
  pg_temp.pid(13), 'a match brought forward does not pull the page to a later journée');

-- Full time reported without the final flag is not final.
update app.fixtures set status = 'finished', home_score = 2, away_score = 2,
  provider_updated_at = '2095-10-01 00:00Z'
where round_id = pg_temp.pid(14);
select extensions.is(app_private.prediction_round_state(pg_temp.pid(14), '2095-10-20 12:00Z'),
  'in_progress', 'finished matches without finalized_at keep the journée in progress');

-- A cancelled match counts as settled.
update app.fixtures set status = 'cancelled', provider_updated_at = '2095-10-02 00:00Z'
where id = pg_temp.pid(1034);

-- Nothing open at all (end of season): the most recent journée played.
update app.fixtures set status = 'finished', home_score = coalesce(home_score, 0),
  away_score = coalesce(away_score, 0),
  finalized_at = kickoff_at + interval '2 hours', provider_updated_at = '2095-10-10 00:00Z'
where season_id = pg_temp.pid(3) and finalized_at is null and status <> 'cancelled';
select extensions.is(app_private.predictions_current_round(pg_temp.pid(3), '2095-10-20 12:00Z'),
  pg_temp.pid(14), 'with nothing open the most recent journée played opens');
select extensions.is(app_private.prediction_round_state(pg_temp.pid(14), '2095-10-20 12:00Z'),
  'completed', 'every match final: completed');
select extensions.is(app_private.prediction_round_state(pg_temp.pid(13), '2095-10-20 12:00Z'),
  'completed', 'final matches and a cancelled one: completed');
select extensions.is(app_private.prediction_round_state(pg_temp.pid(11), '2095-10-20 12:00Z'),
  'completed', 'journée 1 completed once its leftover is final');

-- A season with no fixture has no current journée.
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.pid(4), pg_temp.pid(2), '2096/97', '2096-08-01', '2097-06-30', 'planned', false);
select extensions.is(app_private.predictions_current_round(pg_temp.pid(4), '2096-09-01 12:00Z'),
  null, 'a season without matches has no journée');

-- ---------------------------------------------------------------------------
-- The switch
-- ---------------------------------------------------------------------------
select app_private.predictions_configure('off');
select extensions.ok(not app_private.predictions_access_allowed(pg_temp.pid(9)), 'off: nobody');
select extensions.ok(not app_private.predictions_access_allowed(null), 'off: no visitor');
select app_private.predictions_configure('testers', null, array[pg_temp.pid(9)]);
select extensions.ok(app_private.predictions_access_allowed(pg_temp.pid(9)), 'testers: the tester');
select extensions.ok(not app_private.predictions_access_allowed(pg_temp.pid(8)), 'testers: not another account');
select extensions.ok(not app_private.predictions_access_allowed(null), 'testers: not a visitor');
select app_private.predictions_configure('public');
select extensions.ok(app_private.predictions_access_allowed(pg_temp.pid(8)), 'public: any account');
select extensions.ok(app_private.predictions_access_allowed(null), 'public: a visitor');
select extensions.throws_ok($$select app_private.predictions_configure('everyone')$$,
  '22023', 'predictions_mode_invalid', 'an unknown mode is refused');
select extensions.throws_ok($$select app_private.predictions_configure(null)$$,
  '22023', 'predictions_mode_invalid', 'a null mode is refused');
select extensions.is(
  (select count(*)::integer from app_private.prediction_job_runs
   where kind = 'operator' and detail ->> 'action' = 'configure'),
  4, 'every configuration change is logged');

select * from extensions.finish();
rollback;
