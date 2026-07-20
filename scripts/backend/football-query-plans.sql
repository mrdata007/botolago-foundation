-- Local-only Phase 3 query-plan review. This script is transactional and
-- rolls back all synthetic rows. Never run it against production.
begin;

insert into app.competitions (id, slug, name, short_name, competition_type)
values ('33000000-0000-4000-8000-000000000001', 'plan-league', 'Plan League', 'PL', 'league');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (
  '43000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000001',
  '2029/30', '2029-08-01', '2030-06-30', 'active', true
);
insert into app.teams (id, slug, name, short_name)
values
  ('63000000-0000-4000-8000-000000000001', 'plan-home', 'Plan Home', 'PH'),
  ('63000000-0000-4000-8000-000000000002', 'plan-away', 'Plan Away', 'PA');

insert into app.fixtures (
  competition_id, season_id, home_team_id, away_team_id, kickoff_at,
  status, period, minute, home_score, away_score, provider_updated_at, source_sequence
)
select
  '33000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000001',
  case when item % 2 = 0 then '63000000-0000-4000-8000-000000000001'::uuid else '63000000-0000-4000-8000-000000000002'::uuid end,
  case when item % 2 = 0 then '63000000-0000-4000-8000-000000000002'::uuid else '63000000-0000-4000-8000-000000000001'::uuid end,
  timestamptz '2030-01-01 00:00:00+00' + item * interval '2 minutes',
  case when item % 50 = 0 then 'live_second_half'::app.fixture_status else 'scheduled'::app.fixture_status end,
  case when item % 50 = 0 then 'second_half'::app.fixture_period else 'pre_match'::app.fixture_period end,
  case when item % 50 = 0 then 70 else null end,
  case when item % 50 = 0 then 1 else null end,
  case when item % 50 = 0 then 0 else null end,
  timestamptz '2030-01-01 00:00:00+00' + item * interval '2 minutes',
  item
from generate_series(1, 5000) item;

insert into app.match_events (
  fixture_id, team_id, event_type, minute, sequence_number, period,
  idempotency_key, provider_updated_at, source_sequence
)
select fixture.id, '63000000-0000-4000-8000-000000000001', 'period_start',
  item % 91, item, 'first_half', 'plan:event:' || item,
  timestamptz '2030-01-01 00:00:00+00' + item * interval '1 second', item
from (select id from app.fixtures order by kickoff_at limit 1) fixture
cross join generate_series(1, 1000) item;

insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id, last_seen_at
)
select 'fixture', 'fixture', 'plan-fixture-' || row_number() over (order by fixture.kickoff_at),
  fixture.id, fixture.provider_updated_at
from (select * from app.fixtures order by kickoff_at limit 1000) fixture;

analyze app.fixtures;
analyze app.match_events;
analyze app_private.football_provider_mappings;

explain (analyze, buffers, costs, summary)
select id, kickoff_at
from app.fixtures
where kickoff_at >= timestamptz '2030-01-03 00:00:00+00'
  and kickoff_at < timestamptz '2030-01-04 00:00:00+00'
order by kickoff_at, id
limit 100;

explain (analyze, buffers, costs, summary)
select id, kickoff_at, status, minute, home_score, away_score
from app.fixtures
where status in (
  'live_first_half', 'half_time', 'live_second_half', 'extra_time',
  'penalties', 'suspended', 'delayed'
)
order by kickoff_at, id
limit 100;

explain (analyze, buffers, costs, summary)
select id, kickoff_at
from app.fixtures
where competition_id = '33000000-0000-4000-8000-000000000001'
order by kickoff_at, id
limit 100;

explain (analyze, buffers, costs, summary)
select id, kickoff_at
from app.fixtures
where '63000000-0000-4000-8000-000000000001' in (home_team_id, away_team_id)
order by kickoff_at desc, id desc
limit 20;

explain (analyze, buffers, costs, summary)
select event.id
from app.match_events event
where event.fixture_id = (select id from app.fixtures order by kickoff_at limit 1)
order by event.period, event.minute, event.added_time, event.sequence_number, event.id;

explain (analyze, buffers, costs, summary)
select internal_entity_id
from app_private.football_provider_mappings
where provider_name = 'fixture'
  and entity_type = 'fixture'
  and external_id = 'plan-fixture-500';

rollback;
