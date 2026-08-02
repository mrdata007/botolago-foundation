begin;

select extensions.no_plan();

select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'app.player_fixture_performances'::regclass),
  'historical player performances have RLS enabled'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'api.ingest_historical_player_fixture_performance(text,text,text,text,jsonb,jsonb,timestamptz)',
    'execute'
  ),
  'anonymous clients cannot persist historical player performances'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'api.ingest_historical_player_fixture_performance(text,text,text,text,jsonb,jsonb,timestamptz)',
    'execute'
  ),
  'the service role can persist historical player performances'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'api.football_historical_player_rating_inputs(text,text)',
    'execute'
  ),
  'browser roles cannot read private historical rating inputs'
);

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('12000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (
  id, slug, name, short_name, competition_type, country_id
) values (
  '32000000-0000-4000-8000-000000000001', 'historical-performance-league',
  'Historical Performance League', 'HPL', 'league',
  '12000000-0000-4000-8000-000000000001'
);
insert into app.seasons (
  id, competition_id, label, starts_on, ends_on, status, is_current
) values (
  '42000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  '2024/25', '2024-09-01', '2025-06-30', 'completed', false
);
insert into app.teams (id, slug, name, short_name, code, country_id)
values
  (
    '62000000-0000-4000-8000-000000000001', 'historical-performance-home',
    'Historical Performance Home', 'HP Home', 'HPH',
    '12000000-0000-4000-8000-000000000001'
  ),
  (
    '62000000-0000-4000-8000-000000000002', 'historical-performance-away',
    'Historical Performance Away', 'HP Away', 'HPA',
    '12000000-0000-4000-8000-000000000001'
  );
insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id,
  kickoff_at, status, period, home_score, away_score,
  provider_updated_at, source_sequence, source_version, finalized_at
) values (
  '52000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000002',
  '2025-01-10T18:00:00Z', 'finished', 'post_match', 2, 1,
  '2025-01-10T20:00:00Z', 1, 'sportsmonks:test-fixture:v1',
  '2025-01-10T20:00:00Z'
);

insert into app.players (id, slug, full_name, display_name, position)
select
  md5('historical-performance-player-' || number)::uuid,
  'historical-performance-player-' || number,
  'Historical Performance Player ' || number,
  'HP Player ' || number,
  case
    when number <= 2 then 'goalkeeper'::app.football_position
    when number <= 10 then 'defender'::app.football_position
    when number <= 18 then 'midfielder'::app.football_position
    else 'forward'::app.football_position
  end
from generate_series(1, 22) number;

insert into app.team_memberships (
  player_id, team_id, season_id, shirt_number, valid_from, valid_to, active
)
select
  md5('historical-performance-player-' || number)::uuid,
  case when number <= 11
    then '62000000-0000-4000-8000-000000000001'::uuid
    else '62000000-0000-4000-8000-000000000002'::uuid
  end,
  '42000000-0000-4000-8000-000000000001',
  case when number <= 11 then number else number - 11 end,
  '2024-09-01', '2025-06-30', true
from generate_series(1, 22) number;

insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id,
  source_version, last_seen_at, active
) values
  (
    'sportsmonks', 'competition', '88001',
    '32000000-0000-4000-8000-000000000001',
    'sportsmonks:88001:v1', statement_timestamp(), true
  ),
  (
    'sportsmonks', 'season', '28001',
    '42000000-0000-4000-8000-000000000001',
    'sportsmonks:28001:v1', statement_timestamp(), true
  ),
  (
    'sportsmonks', 'team', '68001',
    '62000000-0000-4000-8000-000000000001',
    'sportsmonks:68001:v1', statement_timestamp(), true
  ),
  (
    'sportsmonks', 'team', '68002',
    '62000000-0000-4000-8000-000000000002',
    'sportsmonks:68002:v1', statement_timestamp(), true
  ),
  (
    'sportsmonks', 'fixture', '19800001',
    '52000000-0000-4000-8000-000000000001',
    'sportsmonks:19800001:v1', statement_timestamp(), true
  );

insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id,
  source_version, last_seen_at, active
)
select
  'sportsmonks', 'player', (80000 + number)::text,
  md5('historical-performance-player-' || number)::uuid,
  'sportsmonks:' || (80000 + number)::text || ':v1', statement_timestamp(), true
from generate_series(1, 22) number;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select extensions.ok(
  api.begin_historical_performance_ingestion(
    'sportsmonks', '28001', '{"seasonId":28001}'::jsonb, '{}'::jsonb
  ) is not null,
  'the service-only ledger accepts the dedicated historical performance job'
);

select extensions.is(
  api.football_historical_performance_fixture_batch(
    'sportsmonks', '28001', null, 5
  ) ->> 'expectedFixtureCount',
  '1',
  'the fixture batch is bounded to the completed historical season'
);
select extensions.is(
  jsonb_array_length(
    api.football_historical_performance_fixture_batch(
      'sportsmonks', '28001', null, 5
    ) -> 'items'
  ),
  1,
  'the historical batch returns the one mapped finished fixture'
);

select extensions.is(
  api.ingest_historical_player_fixture_performance(
    'sportsmonks', '28001', '19800001',
    'sportsmonks-fixture:' || repeat('a', 64),
    (
      select jsonb_agg(jsonb_build_object(
        'externalPlayerId', (80000 + number)::text,
        'externalTeamId', case when number <= 11 then '68001' else '68002' end,
        'started', true,
        'appeared', true,
        'minutes', 90,
        'goals', case when number = 19 then 2 else 0 end,
        'assists', case when number = 15 then 1 else 0 end,
        'cleanSheets', case when number <= 11 then 1 else 0 end,
        'goalsConceded', case when number <= 2 then 1 else 0 end,
        'saves', case when number <= 2 then 3 else 0 end,
        'penaltiesSaved', 0,
        'penaltiesMissed', 0,
        'yellowCards', 0,
        'redCards', 0,
        'secondYellowDismissals', 0,
        'ownGoals', 0,
        'providerRating', 6.0 + number / 10.0
      ) order by number)
      from generate_series(1, 22) number
    ) || jsonb_build_array(
      jsonb_build_object(
        'externalPlayerId', '89999',
        'externalTeamId', '68002',
        'started', false,
        'appeared', false,
        'minutes', 0,
        'goals', 0,
        'assists', 0,
        'cleanSheets', 0,
        'goalsConceded', 0,
        'saves', 0,
        'penaltiesSaved', 0,
        'penaltiesMissed', 0,
        'yellowCards', 0,
        'redCards', 0,
        'secondYellowDismissals', 0,
        'ownGoals', 0,
        'providerRating', null
      )
    ),
    jsonb_build_object(
      'lineupRowsSeen', 23,
      'validPlayerRows', 23,
      'excludedIncompleteRows', 0,
      'starterRows', 22,
      'teamCount', 2,
      'detailRows', 66,
      'invalidDetailRows', 0
    ),
    statement_timestamp()
  ) ->> 'active',
  '22',
  'one completed fixture persists an exact active player-performance set'
);
reset role;
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances where active),
  22,
  'all 22 normalized player facts are active'
);
select extensions.is(
  (select excluded_mapping_rows
   from app_private.historical_performance_fixture_coverage),
  1,
  'one unmappable substitute is quarantined explicitly'
);
select extensions.is(
  (select excluded_incomplete_rows
   from app_private.historical_performance_fixture_coverage),
  1,
  'fixture accounting includes every provider lineup row'
);
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.football_historical_player_rating_inputs(
    'sportsmonks', '28001'
  ) ->> 'coveredFixtureCount',
  '1',
  'rating inputs open only after exact fixture coverage reconciles'
);
select extensions.is(
  jsonb_array_length(
    api.football_historical_player_rating_inputs('sportsmonks', '28001') -> 'rows'
  ),
  22,
  'the rating input aggregate contains only players with provider performance facts'
);

select extensions.is(
  api.ingest_historical_player_season_ratings(
    'sportsmonks', '28001',
    'botolago-preseason-rating-v2-fixture-performance',
    (
      select jsonb_agg(jsonb_build_object(
        'externalPlayerId', (80000 + number)::text,
        'position', case
          when number <= 2 then 'GK'
          when number <= 10 then 'DEF'
          when number <= 18 then 'MID'
          else 'FWD'
        end,
        'appearances', 1,
        'starts', 1,
        'minutes', 90,
        'goals', case when number = 19 then 2 else 0 end,
        'assists', case when number = 15 then 1 else 0 end,
        'cleanSheets', case when number <= 11 then 1 else 0 end,
        'goalsConceded', case when number <= 2 then 1 else 0 end,
        'saves', case when number <= 2 then 3 else 0 end,
        'penaltiesSaved', 0,
        'penaltiesMissed', 0,
        'yellowCards', 0,
        'redCards', 0,
        'secondYellowDismissals', 0,
        'ownGoals', 0,
        'providerRating', 6.0 + number / 10.0,
        'fantasyEquivalentPoints', number,
        'pointsPer90', number,
        'confidence', 0.1,
        'rating', 4.0 + number / 10.0,
        'algorithmVersion', 'botolago-preseason-rating-v2-fixture-performance'
      ) order by number)
      from generate_series(1, 22) number
    ),
    statement_timestamp()
  ) ->> 'active',
  '22',
  'the exact v2 rating set replaces neutral fallbacks atomically'
);
reset role;
select extensions.is(
  (select count(*)::integer from app.player_season_ratings
   where active and algorithm_version = 'botolago-preseason-rating-v2-fixture-performance'),
  22,
  'every active rating uses completed-fixture performance evidence'
);

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select count(*) from app.player_fixture_performances$$,
  '42501',
  null,
  'raw historical performance facts remain hidden from browser roles'
);
reset role;

select * from extensions.finish();
rollback;
