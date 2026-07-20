begin;

select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('11000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (
  '31000000-0000-4000-8000-000000000001', 'ingestion-league',
  'Ingestion League', 'IL', 'league', '11000000-0000-4000-8000-000000000001'
);
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (
  '41000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '2029/30', '2029-08-01', '2030-06-30', 'active', true
);
insert into app.rounds (id, season_id, round_number, name, status)
values (
  '51000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001', 1, 'Round 1', 'active'
);
insert into app.teams (id, slug, name, short_name, code, country_id)
values
  (
    '61000000-0000-4000-8000-000000000001', 'ingestion-home',
    'Ingestion Home', 'IHOME', 'IHM', '11000000-0000-4000-8000-000000000001'
  ),
  (
    '61000000-0000-4000-8000-000000000002', 'ingestion-away',
    'Ingestion Away', 'IAWAY', 'IAW', '11000000-0000-4000-8000-000000000001'
  );

select extensions.ok(
  api.begin_football_ingestion('fixture', 'fixtures', '{"scope":"test"}'::jsonb) is not null,
  'trusted job tracking creates a queryable run'
);

select extensions.ok(
  api.ingest_football_fixture(
    'fixture',
    'fixture-001',
    jsonb_build_object(
      'competitionId', '31000000-0000-4000-8000-000000000001',
      'seasonId', '41000000-0000-4000-8000-000000000001',
      'roundId', '51000000-0000-4000-8000-000000000001',
      'homeTeamId', '61000000-0000-4000-8000-000000000001',
      'awayTeamId', '61000000-0000-4000-8000-000000000002',
      'kickoffAt', '2030-01-01T18:00:00Z',
      'status', 'scheduled',
      'period', 'pre_match',
      'providerUpdatedAt', '2030-01-01T10:00:00Z',
      'sourceSequence', 1,
      'sourceVersion', 'v1'
    )
  ) is not null,
  'normalized fixture ingestion creates a canonical fixture'
);
select extensions.is(
  (select count(*)::integer from app.fixtures),
  1,
  'one canonical fixture exists after first ingestion'
);
select extensions.is(
  (select count(*)::integer from app_private.football_provider_mappings
   where provider_name = 'fixture' and entity_type = 'fixture' and external_id = 'fixture-001'),
  1,
  'provider identity is isolated in the mapping table'
);

select extensions.lives_ok(
  $$select api.ingest_football_fixture(
    'fixture', 'fixture-001',
    jsonb_build_object(
      'competitionId', '31000000-0000-4000-8000-000000000001',
      'seasonId', '41000000-0000-4000-8000-000000000001',
      'roundId', '51000000-0000-4000-8000-000000000001',
      'homeTeamId', '61000000-0000-4000-8000-000000000001',
      'awayTeamId', '61000000-0000-4000-8000-000000000002',
      'kickoffAt', '2030-01-01T18:00:00Z',
      'status', 'live_first_half', 'period', 'first_half',
      'minute', 12, 'homeScore', 1, 'awayScore', 0,
      'providerUpdatedAt', '2030-01-01T18:12:00Z',
      'sourceSequence', 2, 'sourceVersion', 'v2'
    )
  )$$,
  'repeated ingestion updates the mapped fixture idempotently'
);
select extensions.is(
  (select count(*)::integer from app.fixtures),
  1,
  'idempotent ingestion never duplicates the fixture'
);
select extensions.is(
  (select home_score from app.fixtures limit 1),
  1,
  'newer provider correction updates the score'
);
select extensions.is(
  (select count(*)::integer from api.live_fixture_updates),
  1,
  'live fixture changes maintain the narrow Realtime projection'
);

select extensions.throws_ok(
  $$select api.ingest_football_fixture(
    'fixture', 'fixture-001',
    jsonb_build_object(
      'competitionId', '31000000-0000-4000-8000-000000000001',
      'seasonId', '41000000-0000-4000-8000-000000000001',
      'roundId', '51000000-0000-4000-8000-000000000001',
      'homeTeamId', '61000000-0000-4000-8000-000000000001',
      'awayTeamId', '61000000-0000-4000-8000-000000000002',
      'kickoffAt', '2030-01-01T18:00:00Z',
      'status', 'scheduled', 'period', 'pre_match',
      'providerUpdatedAt', '2030-01-01T10:00:00Z',
      'sourceSequence', 1
    )
  )$$,
  'P0001',
  'STALE_UPDATE',
  'older fixture payload cannot overwrite newer canonical state'
);

select extensions.throws_ok(
  $$select api.ingest_football_fixture(
    'fixture', 'fixture-invalid',
    '{"status":"unknown"}'::jsonb
  )$$,
  '22023',
  'INVALID_PROVIDER_PAYLOAD',
  'malformed provider payload is rejected before persistence'
);

insert into app.players (id, slug, full_name, display_name, position)
values (
  '71000000-0000-4000-8000-000000000001',
  'event-player', 'Event Player', 'E. Player', 'forward'
);
insert into app.match_events (
  fixture_id, team_id, player_id, event_type, minute, sequence_number,
  period, idempotency_key, provider_event_key, provider_updated_at, source_sequence
) select
  fixture.id, '61000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001', 'goal', 12, 1,
  'first_half', 'fixture-001:event-1', 'event-1',
  '2030-01-01T18:12:00Z', 1
from app.fixtures fixture limit 1;
select extensions.throws_ok(
  $$insert into app.match_events (
      fixture_id, event_type, minute, sequence_number, period,
      idempotency_key, provider_updated_at
    ) select id, 'goal', 12, 2, 'first_half',
      'fixture-001:event-1', '2030-01-01T18:13:00Z'
    from app.fixtures limit 1$$,
  '23505',
  null,
  'duplicate match event delivery is prevented by idempotency key'
);

insert into app.standings (
  competition_id, season_id, team_id, rank, played, won, points,
  provider_updated_at, source_sequence
) values
  (
    '31000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001', 1, 1, 1, 3,
    '2030-01-01T20:00:00Z', 2
  ),
  (
    '31000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002', 2, 1, 0, 0,
    '2030-01-01T20:00:00Z', 2
  );
select extensions.throws_ok(
  $$update app.standings set points = 0,
      provider_updated_at = '2030-01-01T19:00:00Z', source_sequence = 1
    where rank = 1$$,
  'P0001',
  'STALE_UPDATE',
  'older standing snapshot cannot overwrite a newer table'
);

select extensions.is(
  jsonb_array_length(api.football_match_timeline((select id from app.fixtures limit 1), 'fr')),
  1,
  'timeline read model returns ordered canonical events'
);
select extensions.is(
  api.football_standings('41000000-0000-4000-8000-000000000001', '', 'overall', 'fr') -> 0 ->> 'rank',
  '1',
  'standing read model preserves rank order'
);

select * from extensions.finish();
rollback;
