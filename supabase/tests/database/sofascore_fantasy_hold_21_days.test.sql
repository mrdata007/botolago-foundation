begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- A held SofaScore Fantasy match is retried until 21 days after kickoff (migration 20261013150100),
-- decided by time, not by a count of attempts. Real functions, synthetic world:
--   1 the window and the permissions   2 api.service_sofascore_fantasy_due   3 api.service_sofascore_fantasy_note

create function pg_temp.id(p_prefix text, n integer) returns uuid language sql immutable as
  $$ select (p_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id('c0', 1), 'MA', 'MAR')
  on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id('c0', 2), 'sofa-hold-test', 'SofaScore Hold Test', 'SH', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id('c0', 3), pg_temp.id('c0', 2), '2026/2027', '2026-08-01', '2027-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
values (pg_temp.id('c0', 7), pg_temp.id('c0', 3), 1, 'Round 1', 'completed');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id('c1', i), 'sfh-club-' || i, 'Sfh Club ' || i, 'HC' || i, 'HC' || i,
  (select id from app.countries where iso_alpha2 = 'MA') from generate_series(1, 2) i;

-- Fixtures kicked off 20 and 22 days ago (and a recent one), all finished and finalized.
create temporary table fx (n integer primary key, age interval);
insert into fx values (1, interval '20 days'), (2, interval '22 days'), (3, interval '22 days'),
  (4, interval '22 days'), (5, interval '2 days'), (6, interval '22 days');
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status,
  home_score, away_score, provider_updated_at, source_sequence, finalized_at)
select pg_temp.id('f0', n), pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c0', 7), pg_temp.id('c1', 1),
  pg_temp.id('c1', 2), statement_timestamp() - age, 'finished', 1, 0, statement_timestamp() - age, 10 + n,
  statement_timestamp() - age + interval '2 hours'
from fx;

-- Held with stored replies and a retry that is due. Attempts: far beyond the old limit of 24.
insert into app_private.sofascore_fantasy_attempts (fixture_id, sofascore_event_id, status, attempts, last_attempt_at,
  next_retry_at, last_outcome, match_data)
select pg_temp.id('f0', n), (2000 + n)::text, 'held', att, statement_timestamp() - interval '7 hours',
  statement_timestamp() - interval '1 hour', 'unmapped_players', '{"version":1}'::jsonb
from (values (1, 40), (2, 40), (3, 1), (4, 2), (5, 40), (6, 3)) as t(n, att);

create function pg_temp.act(p_who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case p_who when 'svc' then '{"role":"service_role"}' else '{"role":"anon"}' end, true);
end $$;
create function pg_temp.code(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
create function pg_temp.due_retry() returns text[] language sql as $$
  select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(
    api.service_sofascore_fantasy_due(50, 0, 504, 24, 4) -> 'retry') x $$;

-- 1 window and permissions ------------------------------------------------------------------------------------
select extensions.is(app_private.sofascore_fantasy_hold_window(), interval '21 days', '1.1 the window is 21 days');
select extensions.ok(not has_function_privilege('service_role', 'app_private.sofascore_fantasy_hold_window()', 'execute'),
  '1.2 the window helper is private');
select extensions.ok(has_function_privilege('service_role', 'api.service_sofascore_fantasy_due(integer,integer,integer,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_sofascore_fantasy_due(integer,integer,integer,integer,integer)', 'execute')
  and has_function_privilege('service_role', 'api.service_sofascore_fantasy_note(uuid,text,text,text,jsonb,jsonb,text,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'api.service_sofascore_fantasy_note(uuid,text,text,text,jsonb,jsonb,text,timestamptz)', 'execute'),
  '1.3 grants are unchanged: the service role only');
select pg_temp.act('anon');
select extensions.is(pg_temp.code('select api.service_sofascore_fantasy_due(1, 0, 504, 24, 4)'), 'forbidden', '1.4 the due list refuses other callers');
select pg_temp.act('svc');

-- 2 what is due -----------------------------------------------------------------------------------------------------
-- 20 days after kickoff (40 attempts): still retried. 22 days (40 attempts): given up in time.
-- 22 days after a reopen (1 or 2 attempts): three more tries. 3 attempts since the reopen: no more.
select extensions.is(pg_temp.due_retry(), array[pg_temp.id('f0', 1)::text, pg_temp.id('f0', 3)::text,
    pg_temp.id('f0', 4)::text, pg_temp.id('f0', 5)::text]::text[] ,
  '2.1 day 20 and day 2 are retried however many attempts; day 22 only while the reopen allowance lasts');
select extensions.ok(pg_temp.id('f0', 2)::text <> all (pg_temp.due_retry()), '2.2 day 22 with 40 attempts is no longer retried');
select extensions.ok(pg_temp.id('f0', 6)::text <> all (pg_temp.due_retry()), '2.3 day 22 with 3 attempts since the reopen is not either');
select extensions.is(api.service_sofascore_fantasy_due(50, 0, 504, 1, 4) -> 'retry' = api.service_sofascore_fantasy_due(50, 0, 504, 500, 4) -> 'retry',
  true, '2.4 p_max_attempts is ignored');
select extensions.is(pg_temp.code('select api.service_sofascore_fantasy_due(1, 0, 721, 24, 4)'), 'sofascore_fantasy_due_invalid',
  '2.5 the look-back stays bounded (30 days)');
-- A retry that is not yet due waits, whatever the window says.
update app_private.sofascore_fantasy_attempts set next_retry_at = statement_timestamp() + interval '3 hours'
 where fixture_id = pg_temp.id('f0', 1);
select extensions.ok(pg_temp.id('f0', 1)::text <> all (pg_temp.due_retry()), '2.6 the back-off still applies inside the window');
update app_private.sofascore_fantasy_attempts set next_retry_at = statement_timestamp() - interval '1 hour'
 where fixture_id = pg_temp.id('f0', 1);
-- A match with no stored replies is not a retry.
update app_private.sofascore_fantasy_attempts set match_data = null where fixture_id = pg_temp.id('f0', 5);
select extensions.ok(pg_temp.id('f0', 5)::text <> all (pg_temp.due_retry()), '2.7 a retry needs the stored replies');

-- 3 what a note does -----------------------------------------------------------------------------------------------
create function pg_temp.hold(p_n integer) returns jsonb language sql as $$
  select api.service_sofascore_fantasy_note(pg_temp.id('f0', p_n), (2000 + p_n)::text, 'held', 'held:unmapped_players',
    '[{"code":"unmapped_players"}]'::jsonb, '{"version":1}'::jsonb, null, statement_timestamp() + interval '6 hours') $$;
select extensions.is(pg_temp.hold(1) ->> 'status', 'held', '3.1 a hold on day 20 stays held');
select extensions.ok((select match_data is not null and next_retry_at is not null from app_private.sofascore_fantasy_attempts
    where fixture_id = pg_temp.id('f0', 1)), '3.2 and keeps its replies, so a retry costs no request');
select extensions.is(pg_temp.hold(5) ->> 'status', 'held', '3.3 a recent match stays held');
select extensions.is(pg_temp.hold(2) ->> 'status', 'gave_up', '3.4 a hold on day 22 is given up');
select extensions.ok((select match_data is null and next_retry_at is null from app_private.sofascore_fantasy_attempts
    where fixture_id = pg_temp.id('f0', 2)), '3.5 and drops its replies');
select extensions.is(pg_temp.hold(3) ->> 'status', 'held', '3.6 day 22 after a reopen: the second try is still held');
select extensions.is(pg_temp.hold(4) ->> 'status', 'gave_up', '3.7 and the third try since the reopen is given up');
select extensions.is(pg_temp.hold(6) ->> 'status', 'gave_up', '3.8 day 22 with 3 attempts since the reopen: given up');
-- The first note on a match never seen before is held, however old it is.
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status,
  home_score, away_score, provider_updated_at, source_sequence, finalized_at)
values (pg_temp.id('f0', 9), pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c0', 7), pg_temp.id('c1', 2),
  pg_temp.id('c1', 1), statement_timestamp() - interval '30 days', 'finished', 0, 0, statement_timestamp() - interval '30 days', 30,
  statement_timestamp() - interval '30 days');
select extensions.is(pg_temp.hold(9) ->> 'status', 'held', '3.9 the first note on an unseen match is held (the catch-up window decides whether it is fetched)');
select extensions.is(api.service_sofascore_fantasy_note(pg_temp.id('f0', 1), '2001', 'recorded', 'recorded', '[]'::jsonb, null, null, null) ->> 'status',
  'recorded', '3.10 a recorded match is recorded');
select extensions.is(pg_temp.hold(1) ->> 'unchanged', 'true', '3.11 and stays recorded');
select extensions.is(app_private.sofascore_fantasy_reopen(null, pg_temp.id('f0', 2)), 1,
  '3.12 staff or a link can still reopen a match given up');

select * from extensions.finish();
rollback;
