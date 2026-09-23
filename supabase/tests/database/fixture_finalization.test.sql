-- Fixture finalization reaches the Fantasy lifecycle through ingestion.
--
-- Every other test that scores a gameweek sets `app.fixtures.finalized_at`
-- by hand, which is how production ran 480 finished fixtures without one
-- and could never leave `football_not_final`. Here the fixture only ever
-- changes through `api.ingest_football_fixture`, the RPC the SportsMonks
-- adapter calls, and the lifecycle is asked what it would do with it.
begin;
select extensions.no_plan();

insert into app.countries(id, iso_alpha2, iso_alpha3)
values ('fa000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions(id, slug, name, short_name, competition_type, country_id)
values ('fa100000-0000-4000-8000-000000000001', 'finalization-test', 'Finalization Test',
  'FNT', 'league', 'fa000000-0000-4000-8000-000000000001');
insert into app.seasons(id, competition_id, label, starts_on, ends_on, status, is_current)
values ('fa200000-0000-4000-8000-000000000001', 'fa100000-0000-4000-8000-000000000001',
  'Finalization season', current_date - 1, current_date + 100, 'active', true);
insert into app.rounds(id, season_id, round_number, name)
values ('fa300000-0000-4000-8000-000000000001', 'fa200000-0000-4000-8000-000000000001',
  1, 'Gameweek 1');
insert into app.teams(id, slug, name, short_name, code, country_id)
select md5('finalization-club-' || n)::uuid, 'finalization-club-' || n,
  'Finalization Club ' || n, 'FC' || n, 'F' || n, 'fa000000-0000-4000-8000-000000000001'
from generate_series(1, 2) n;

-- A payload shaped exactly like the one `persistFixture` sends. Kickoff is
-- two hours ago, so a full-time observation now is a real result.
create temporary table finalization_clock on commit drop as
select date_trunc('second', statement_timestamp()) - interval '2 hours' as kickoff_at;

create function pg_temp.fixture_payload(
  p_status text, p_period text, p_updated_minutes integer, p_finalized_at timestamptz
) returns jsonb language sql as $$
  select jsonb_build_object(
    'competitionId', 'fa100000-0000-4000-8000-000000000001',
    'seasonId', 'fa200000-0000-4000-8000-000000000001',
    'roundId', 'fa300000-0000-4000-8000-000000000001',
    'homeTeamId', md5('finalization-club-1')::uuid,
    'awayTeamId', md5('finalization-club-2')::uuid,
    'venueId', null,
    'kickoffAt', (select kickoff_at from finalization_clock),
    'status', p_status,
    'period', p_period,
    'minute', null,
    'addedTime', null,
    'homeScore', case when p_status = 'not_started' then null else 2 end,
    'awayScore', case when p_status = 'not_started' then null else 1 end,
    'providerUpdatedAt',
      (select kickoff_at from finalization_clock) + make_interval(mins => p_updated_minutes),
    'sourceSequence', p_updated_minutes + 1000,
    'sourceVersion', 'sportsmonks:fin-1:' || p_updated_minutes,
    'finalizedAt', p_finalized_at
  )
$$;

create function pg_temp.fixture() returns app.fixtures language sql as $$
  select fixture.* from app.fixtures fixture
  join app_private.football_provider_mappings mapping
    on mapping.internal_entity_id = fixture.id
  where mapping.provider_name = 'fixture' and mapping.entity_type = 'fixture'
    and mapping.external_id = 'fin-1'
$$;

-- 1. Before the match: nothing is final.
select api.ingest_football_fixture('fixture', 'fin-1',
  pg_temp.fixture_payload('not_started', 'pre_match', -60, null));
select extensions.is((pg_temp.fixture()).finalized_at, null,
  'a fixture that has not started carries no finalization time');

-- The Fantasy side of the same match: one open gameweek whose deadline has
-- passed, assigned the ingested fixture at its real kickoff.
insert into app.fantasy_competitions(id, football_competition_id, slug, name, active)
values ('fa500000-0000-4000-8000-000000000001', 'fa100000-0000-4000-8000-000000000001',
  'finalization-test', 'Finalization Test', true);
insert into app.fantasy_seasons(id, fantasy_competition_id, football_season_id,
  ruleset_id, name, status, starts_at, ends_at)
values ('fa600000-0000-4000-8000-000000000001', 'fa500000-0000-4000-8000-000000000001',
  'fa200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  'Finalization season', 'registration_open', current_date - 1, current_date + 100);
insert into app.fantasy_gameweeks(id, fantasy_season_id, football_round_id,
  sequence_number, name, deadline_at, starts_at, ends_at, status)
select 'fa700000-0000-4000-8000-000000000001', 'fa600000-0000-4000-8000-000000000001',
  'fa300000-0000-4000-8000-000000000001', 1, 'Gameweek 1',
  kickoff_at - interval '90 minutes', kickoff_at, kickoff_at + interval '1 day', 'open'
from finalization_clock;
insert into app.fantasy_fixture_assignments(fantasy_season_id, fixture_id, gameweek_id,
  original_gameweek_id, original_kickoff_at, assigned_kickoff_at, source_version)
select 'fa600000-0000-4000-8000-000000000001', (pg_temp.fixture()).id,
  'fa700000-0000-4000-8000-000000000001', 'fa700000-0000-4000-8000-000000000001',
  kickoff_at, kickoff_at, 1
from finalization_clock;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.service_advance_fantasy_lifecycle(
  'fa700000-0000-4000-8000-000000000001', 1, 100)->>'status',
  'locked', 'the gameweek locks at its passed deadline');

-- In play. A finalization time that arrives with a live status is an
-- adapter error and is refused, not stored.
select api.ingest_football_fixture('fixture', 'fin-1',
  pg_temp.fixture_payload('live_second_half', 'second_half', 70,
    statement_timestamp() - interval '1 minute'));
select extensions.is((pg_temp.fixture()).finalized_at, null,
  'a live fixture never stores a finalization time, even if one is sent');
select extensions.is(api.service_advance_fantasy_lifecycle(
  'fa700000-0000-4000-8000-000000000001', 2, 100)->>'status',
  'live', 'live football moves the gameweek to live');

-- Finished, but reported the way the adapter did before the fix: no
-- finalization time. This is exactly where production would have stayed.
select api.ingest_football_fixture('fixture', 'fin-1',
  pg_temp.fixture_payload('finished', 'post_match', 110, null));
select extensions.is((pg_temp.fixture()).finalized_at, null,
  'a finished fixture without a finalization time stays unfinalized');
select extensions.is(api.service_advance_fantasy_lifecycle(
  'fa700000-0000-4000-8000-000000000001', 3, 100)->>'waitingReason',
  'football_not_final', 'without finalization the lifecycle waits: the production stall');

-- 2. Full time observed: the adapter sends the observation time.
create temporary table finalization_first on commit drop as
select statement_timestamp() - interval '5 minutes' as finalized_at;
select api.ingest_football_fixture('fixture', 'fin-1',
  pg_temp.fixture_payload('finished', 'post_match', 115,
    (select finalized_at from finalization_first)));
select extensions.is((pg_temp.fixture()).finalized_at,
  (select finalized_at from finalization_first),
  'a terminal provider state stores the finalization time');

-- 3. A later refresh that sends no finalization time cannot erase it. Before
-- the fix this raised INVALID_FIXTURE_STATE and failed the whole refresh.
select extensions.lives_ok($$select api.ingest_football_fixture('fixture', 'fin-1',
  pg_temp.fixture_payload('finished', 'post_match', 130, null))$$,
  'a later refresh without a finalization time is accepted');
select extensions.is((pg_temp.fixture()).finalized_at,
  (select finalized_at from finalization_first),
  'the later refresh leaves the stored finalization time untouched');
select extensions.is((pg_temp.fixture()).provider_updated_at,
  (select kickoff_at + interval '130 minutes' from finalization_clock),
  'the rest of the refresh is still applied');

-- 5. Re-ingesting the finished fixture with a newer observation time is
-- idempotent: one fixture, the first finalization time, no error.
select extensions.lives_ok($$select api.ingest_football_fixture('fixture', 'fin-1',
  pg_temp.fixture_payload('finished', 'post_match', 140,
    statement_timestamp() - interval '1 minute'))$$,
  'repeated ingestion of a finalized fixture is accepted');
select extensions.lives_ok($$select api.ingest_football_fixture('fixture', 'fin-1',
  pg_temp.fixture_payload('finished', 'post_match', 140,
    statement_timestamp() - interval '1 minute'))$$,
  'an identical replay is accepted');
select extensions.is((pg_temp.fixture()).finalized_at,
  (select finalized_at from finalization_first),
  'repeated ingestion never moves the first finalization time');
select extensions.is((select count(*)::integer from app_private.football_provider_mappings
  where provider_name = 'fixture' and entity_type = 'fixture' and external_id = 'fin-1'),
  1, 'repeated ingestion never duplicates the fixture');

-- A finished fixture cannot be walked back to an unfinished state by a feed.
select extensions.throws_ok($$select api.ingest_football_fixture('fixture', 'fin-1',
  pg_temp.fixture_payload('live_second_half', 'second_half', 150, null))$$,
  'P0001', 'INVALID_FIXTURE_STATE',
  'a finished fixture cannot regress to live through ingestion');
select extensions.is((pg_temp.fixture()).finalized_at,
  (select finalized_at from finalization_first),
  'the refused regression leaves finalization intact');

-- 4. With every fixture finalized the lifecycle continues to scoring.
select extensions.is(api.service_advance_fantasy_lifecycle(
  'fa700000-0000-4000-8000-000000000001', 3, 100)->>'status',
  'provisional', 'a finalized gameweek leaves football_not_final for provisional scoring');

-- A fixture first seen already at full time (a late backfill) is finalized
-- on insert, and one first seen as a walkover is not.
select api.ingest_football_fixture('fixture', 'fin-2', jsonb_set(jsonb_set(
  pg_temp.fixture_payload('finished', 'post_match', 120,
    statement_timestamp() - interval '1 minute'),
  '{sourceVersion}', '"sportsmonks:fin-2:120"'), '{homeTeamId}',
  to_jsonb(md5('finalization-club-2')::uuid)) || jsonb_build_object(
  'awayTeamId', md5('finalization-club-1')::uuid));
select extensions.isnt((select fixture.finalized_at from app.fixtures fixture
  join app_private.football_provider_mappings mapping on mapping.internal_entity_id = fixture.id
  where mapping.provider_name = 'fixture' and mapping.external_id = 'fin-2'), null,
  'a fixture first ingested at full time is finalized on insert');

select * from extensions.finish();
rollback;
