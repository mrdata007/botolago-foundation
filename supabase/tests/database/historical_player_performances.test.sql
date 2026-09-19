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
      'anonymousStarterRows', 0,
      'identifiedStarterRows', 22,
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

-- ---------------------------------------------------------------------------
-- BG-0011 option B: bounded anonymous starters (identity completeness).
-- A second fixture, in the same season, with a fresh set of 22 identified starter-eligible
-- players plus 4 dedicated "anonymous-shape" external ids that are never mapped -- standing in
-- for provider rows the worker itself would have excluded before ever calling this RPC. Because
-- normalizeHistoricalFixture never sends anonymous rows to the database at all, this test
-- reproduces the DB-layer contract directly: p_rows carries only the 18 identified starters (+
-- bench), and p_coverage declares anonymousStarterRows: 4, identifiedStarterRows: 18.
-- ---------------------------------------------------------------------------

insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id,
  kickoff_at, status, period, home_score, away_score,
  provider_updated_at, source_sequence, source_version, finalized_at
) values (
  '52000000-0000-4000-8000-000000000002',
  '32000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000002',
  '2025-01-17T18:00:00Z', 'finished', 'post_match', 1, 1,
  '2025-01-17T20:00:00Z', 1, 'sportsmonks:test-fixture-2:v1',
  '2025-01-17T20:00:00Z'
),
(
  '52000000-0000-4000-8000-000000000003',
  '32000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000002',
  '2025-01-24T18:00:00Z', 'finished', 'post_match', 0, 0,
  '2025-01-24T20:00:00Z', 1, 'sportsmonks:test-fixture-3:v1',
  '2025-01-24T20:00:00Z'
);

insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id,
  source_version, last_seen_at, active
) values
  (
    'sportsmonks', 'fixture', '19800002',
    '52000000-0000-4000-8000-000000000002',
    'sportsmonks:19800002:v1', statement_timestamp(), true
  ),
  (
    'sportsmonks', 'fixture', '19800003',
    '52000000-0000-4000-8000-000000000003',
    'sportsmonks:19800003:v1', statement_timestamp(), true
  );

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- (b) exactly 4 anonymous starters: boundary, passes. The provider's 22 raw starters are 18
-- identified (numbers 1-18, sent as started) + 4 anonymous (never sent, never persisted); numbers
-- 19-22 are identified bench, keeping the total identified row count at the required 22.
select extensions.is(
  api.ingest_historical_player_fixture_performance(
    'sportsmonks', '28001', '19800002',
    'sportsmonks-fixture:' || repeat('b', 64),
    (
      select jsonb_agg(jsonb_build_object(
        'externalPlayerId', (80000 + number)::text,
        'externalTeamId', case when number <= 11 then '68001' else '68002' end,
        'started', number <= 18,
        'appeared', true,
        'minutes', case when number <= 18 then 90 else 0 end,
        'goals', 0, 'assists', 0, 'cleanSheets', 0, 'goalsConceded', 0, 'saves', 0,
        'penaltiesSaved', 0, 'penaltiesMissed', 0, 'yellowCards', 0, 'redCards', 0,
        'secondYellowDismissals', 0, 'ownGoals', 0, 'providerRating', 6.5
      ) order by number)
      from generate_series(1, 22) number
    ),
    jsonb_build_object(
      'lineupRowsSeen', 26,
      'validPlayerRows', 22,
      'excludedIncompleteRows', 4,
      'starterRows', 18,
      'anonymousStarterRows', 4,
      'identifiedStarterRows', 18,
      'teamCount', 2,
      'detailRows', 66,
      'invalidDetailRows', 0
    ),
    statement_timestamp()
  ) ->> 'anonymousStarterRows',
  '4',
  'exactly 4 anonymous starters is the boundary and still ingests'
);
reset role;
select extensions.is(
  (select anonymous_starter_rows from app_private.historical_performance_fixture_coverage
   where fixture_id = '52000000-0000-4000-8000-000000000002'),
  4,
  'the coverage row records the tolerated anonymous-starter count'
);
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id = '52000000-0000-4000-8000-000000000002' and active),
  22,
  'the 22 identified rows persist; the 4 anonymous starters are never assigned to anyone'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- (h) idempotent re-ingestion: calling the same fixture+source_version again must not duplicate
-- rows or change the active count.
select extensions.is(
  api.ingest_historical_player_fixture_performance(
    'sportsmonks', '28001', '19800002',
    'sportsmonks-fixture:' || repeat('b', 64),
    (
      select jsonb_agg(jsonb_build_object(
        'externalPlayerId', (80000 + number)::text,
        'externalTeamId', case when number <= 11 then '68001' else '68002' end,
        'started', number <= 18,
        'appeared', true,
        'minutes', case when number <= 18 then 90 else 0 end,
        'goals', 0, 'assists', 0, 'cleanSheets', 0, 'goalsConceded', 0, 'saves', 0,
        'penaltiesSaved', 0, 'penaltiesMissed', 0, 'yellowCards', 0, 'redCards', 0,
        'secondYellowDismissals', 0, 'ownGoals', 0, 'providerRating', 6.5
      ) order by number)
      from generate_series(1, 22) number
    ),
    jsonb_build_object(
      'lineupRowsSeen', 26, 'validPlayerRows', 22, 'excludedIncompleteRows', 4,
      'starterRows', 18, 'anonymousStarterRows', 4, 'identifiedStarterRows', 18,
      'teamCount', 2, 'detailRows', 66, 'invalidDetailRows', 0
    ),
    statement_timestamp()
  ) ->> 'active',
  '22',
  'repeat ingestion of the same source_version is idempotent (still 22 active rows)'
);
reset role;
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id = '52000000-0000-4000-8000-000000000002' and active),
  22,
  'idempotent re-ingestion does not duplicate rows'
);

-- (c)/(g) more than 4 anonymous starters: fails outright, and never persists any row for that
-- fixture -- not even the 17 identified ones.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.throws_ok(
  $$select api.ingest_historical_player_fixture_performance(
    'sportsmonks', '28001', '19800003',
    'sportsmonks-fixture:' || repeat('c', 64),
    (
      select jsonb_agg(jsonb_build_object(
        'externalPlayerId', (80000 + number)::text,
        'externalTeamId', case when number <= 11 then '68001' else '68002' end,
        'started', number <= 17,
        'appeared', true,
        'minutes', 90,
        'goals', 0, 'assists', 0, 'cleanSheets', 0, 'goalsConceded', 0, 'saves', 0,
        'penaltiesSaved', 0, 'penaltiesMissed', 0, 'yellowCards', 0, 'redCards', 0,
        'secondYellowDismissals', 0, 'ownGoals', 0, 'providerRating', 6.5
      ) order by number)
      from generate_series(6, 22) number
    ),
    jsonb_build_object(
      'lineupRowsSeen', 22, 'validPlayerRows', 17, 'excludedIncompleteRows', 5,
      'starterRows', 12, 'anonymousStarterRows', 5, 'identifiedStarterRows', 17,
      'teamCount', 2, 'detailRows', 51, 'invalidDetailRows', 0
    ),
    statement_timestamp()
  )$$,
  '22023',
  null,
  '5 anonymous starters (one over the cap) is rejected outright'
);
reset role;
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id = '52000000-0000-4000-8000-000000000003'),
  0,
  'a fixture rejected for excess anonymous starters persists zero rows, not even identified ones'
);

-- The worker (not this rejected RPC call) is responsible for then recording the quarantine via
-- the dedicated RPC. Single-table design (owner correction 2026-09-19): there is no separate
-- quarantine table any more -- the SAME app_private.historical_performance_fixture_coverage row a
-- fixture has always had (or its first-ever row) is UPSERTed with coverage_outcome =
-- 'quarantined', carrying the FULL coverage audit trail, mirroring
-- api.ingest_historical_player_fixture_performance's p_coverage shape exactly.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.quarantine_historical_player_fixture_performance(
    'sportsmonks', '28001', '19800003',
    'sportsmonks-fixture:' || repeat('d', 64),
    jsonb_build_object(
      -- 17 identified starters + 8 identified bench = 25 total identified rows (still >= 22, the
      -- unrelated valid_player_rows floor that stays in force regardless of coverage_outcome),
      -- plus the 5 anonymous starters that are excluded and never sent as rows.
      'lineupRowsSeen', 30, 'validPlayerRows', 25, 'excludedIncompleteRows', 5,
      'anonymousStarterRows', 5, 'identifiedStarterRows', 17,
      'teamCount', 2, 'detailRows', 51, 'invalidDetailRows', 0
    ),
    statement_timestamp()
  ) ->> 'coverageOutcome',
  'quarantined',
  'the quarantine RPC records a fixture over the anonymous-starter cap'
);
select extensions.throws_ok(
  $$select api.quarantine_historical_player_fixture_performance(
    'sportsmonks', '28001', '19800002',
    'sportsmonks-fixture:' || repeat('e', 64),
    jsonb_build_object(
      'lineupRowsSeen', 26, 'validPlayerRows', 22, 'excludedIncompleteRows', 4,
      'anonymousStarterRows', 4, 'identifiedStarterRows', 18,
      'teamCount', 2, 'detailRows', 66, 'invalidDetailRows', 0
    ),
    statement_timestamp()
  )$$,
  '22023',
  null,
  'the quarantine RPC independently refuses a fixture within the tolerated cap'
);
reset role;
select extensions.is(
  (select count(*)::integer from app_private.historical_performance_fixture_coverage
   where fixture_id = '52000000-0000-4000-8000-000000000003'),
  1,
  'quarantining writes exactly one coverage row for the fixture, never a second table or a second row'
);
select extensions.is(
  (select quarantine_reason from app_private.historical_performance_fixture_coverage
   where fixture_id = '52000000-0000-4000-8000-000000000003'),
  'anonymous_starter_rows_exceeded',
  'the quarantine record carries the exact, traceable reason'
);
select extensions.is(
  (select coverage_outcome from app_private.historical_performance_fixture_coverage
   where fixture_id = '52000000-0000-4000-8000-000000000003'),
  'quarantined',
  'the coverage row''s outcome is quarantined'
);

-- api.football_historical_player_rating_inputs: with 3 finished fixtures in the season (28001)
-- and exactly 1 quarantined (19800003), the expected count must be 2, not 3 -- otherwise the
-- season's rating derivation would be permanently blocked by the one genuinely-incomplete fixture.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.football_historical_player_rating_inputs('sportsmonks', '28001') ->> 'expectedFixtureCount',
  '2',
  'the quarantined fixture is excluded from the expected-fixture-count gate'
);
select extensions.is(
  api.football_historical_player_rating_inputs('sportsmonks', '28001') ->> 'quarantinedFixtureCount',
  '1',
  'rating inputs report how many fixtures were quarantined'
);

-- (j) the quarantined fixture contributes nothing to the rating-input aggregate: performanceCount
-- must equal exactly the two accepted fixtures' active rows (22 + 22 = 44), never 44 + fixture
-- 3's 17 identified-but-rejected rows.
select extensions.is(
  api.football_historical_player_rating_inputs('sportsmonks', '28001') ->> 'performanceCount',
  '44',
  'the quarantined fixture contributes zero rows to the rating-input aggregate (44, not 61)'
);

-- (4) a player who appears in the quarantined fixture (19800003) still has their OTHER,
-- accepted fixtures' performances counted normally: player number 10 started fixture 1 (90
-- minutes) and fixture 2 (90 minutes, since number <= 18) and was listed (never persisted) in the
-- rejected fixture 3 -- their rating input must show appearances=2, minutes=180, not 3/270 and not
-- 0/0.
select extensions.is(
  (
    select (row ->> 'minutes')::integer
    from jsonb_array_elements(
      api.football_historical_player_rating_inputs('sportsmonks', '28001') -> 'rows'
    ) row
    where row ->> 'externalPlayerId' = '80010'
  ),
  180,
  'a player who also appears in the quarantined fixture keeps both of their accepted-fixture performances (180 minutes, not 270 or 0)'
);
select extensions.is(
  (
    select (row ->> 'appearances')::integer
    from jsonb_array_elements(
      api.football_historical_player_rating_inputs('sportsmonks', '28001') -> 'rows'
    ) row
    where row ->> 'externalPlayerId' = '80010'
  ),
  2,
  'the same player shows exactly 2 counted appearances (the 2 accepted fixtures), not 3'
);
reset role;

-- (k) nothing was deleted: the quarantined fixture, its players and its provider mapping still
-- SELECT successfully from the base tables after the migration and the quarantine RPC ran.
select extensions.ok(
  (select count(*) from app.fixtures where id = '52000000-0000-4000-8000-000000000003') = 1,
  'the quarantined fixture record itself is never deleted'
);
select extensions.ok(
  (
    select count(*) from app_private.football_provider_mappings
    where provider_name = 'sportsmonks' and entity_type = 'fixture' and external_id = '19800003'
  ) = 1,
  'the quarantined fixture''s provider mapping is never deleted'
);
select extensions.ok(
  (select count(*) from app.players where id = md5('historical-performance-player-10')::uuid) = 1,
  'a player who appeared in the quarantined fixture is never deleted'
);

-- (l) idempotent re-run of the quarantine RPC: calling it again with the same facts must not
-- duplicate the coverage row or throw.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.quarantine_historical_player_fixture_performance(
    'sportsmonks', '28001', '19800003',
    'sportsmonks-fixture:' || repeat('d', 64),
    jsonb_build_object(
      'lineupRowsSeen', 30, 'validPlayerRows', 25, 'excludedIncompleteRows', 5,
      'anonymousStarterRows', 5, 'identifiedStarterRows', 17,
      'teamCount', 2, 'detailRows', 51, 'invalidDetailRows', 0
    ),
    statement_timestamp()
  ) ->> 'coverageOutcome',
  'quarantined',
  'repeat-quarantining the same fixture is safe and idempotent'
);
reset role;
select extensions.is(
  (select count(*)::integer from app_private.historical_performance_fixture_coverage
   where fixture_id = '52000000-0000-4000-8000-000000000003'),
  1,
  'idempotent re-quarantine does not duplicate the coverage row'
);

-- ---------------------------------------------------------------------------
-- Owner addendum (second correction, 2026-09-19), item 1 / bullet 7: a fixture that was
-- PREVIOUSLY ACCEPTED (has a coverage row with coverage_outcome = 'accepted' and active
-- performance rows), then needs re-quarantining because a corrected payload shows more anonymous
-- starters than the original attempt did, and is later accepted again by a further-corrected,
-- clean payload. Proves the single-row UPSERT survives a full accept -> quarantine -> accept
-- cycle without ever creating a second row or losing the fixture/player/mapping records.
-- ---------------------------------------------------------------------------

insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id,
  kickoff_at, status, period, home_score, away_score,
  provider_updated_at, source_sequence, source_version, finalized_at
) values (
  '52000000-0000-4000-8000-000000000004',
  '32000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000002',
  '2025-01-31T18:00:00Z', 'finished', 'post_match', 3, 0,
  '2025-01-31T20:00:00Z', 1, 'sportsmonks:test-fixture-4:v1',
  '2025-01-31T20:00:00Z'
);
insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id,
  source_version, last_seen_at, active
) values (
  'sportsmonks', 'fixture', '19800004',
  '52000000-0000-4000-8000-000000000004',
  'sportsmonks:19800004:v1', statement_timestamp(), true
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Step 1: accept fixture 4 cleanly (0 anonymous, 22 identified) -- the "previously accepted" state.
select extensions.is(
  api.ingest_historical_player_fixture_performance(
    'sportsmonks', '28001', '19800004',
    'sportsmonks-fixture:' || repeat('f', 64),
    (
      select jsonb_agg(jsonb_build_object(
        'externalPlayerId', (80000 + number)::text,
        'externalTeamId', case when number <= 11 then '68001' else '68002' end,
        'started', true, 'appeared', true, 'minutes', 90,
        'goals', 0, 'assists', 0, 'cleanSheets', 0, 'goalsConceded', 0, 'saves', 0,
        'penaltiesSaved', 0, 'penaltiesMissed', 0, 'yellowCards', 0, 'redCards', 0,
        'secondYellowDismissals', 0, 'ownGoals', 0, 'providerRating', 6.5
      ) order by number)
      from generate_series(1, 22) number
    ),
    jsonb_build_object(
      'lineupRowsSeen', 22, 'validPlayerRows', 22, 'excludedIncompleteRows', 0,
      'starterRows', 22, 'anonymousStarterRows', 0, 'identifiedStarterRows', 22,
      'teamCount', 2, 'detailRows', 44, 'invalidDetailRows', 0
    ),
    statement_timestamp()
  ) ->> 'active',
  '22',
  'fixture 4 is first accepted cleanly (the "previously accepted" state)'
);
reset role;
select extensions.is(
  (select coverage_outcome from app_private.historical_performance_fixture_coverage
   where fixture_id = '52000000-0000-4000-8000-000000000004'),
  'accepted',
  'fixture 4 starts out accepted'
);

-- Step 2: a corrected payload now shows 5 anonymous starters -- re-quarantine the SAME fixture.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.quarantine_historical_player_fixture_performance(
    'sportsmonks', '28001', '19800004',
    'sportsmonks-fixture:' || repeat('3', 64),
    jsonb_build_object(
      'lineupRowsSeen', 27, 'validPlayerRows', 22, 'excludedIncompleteRows', 5,
      'anonymousStarterRows', 5, 'identifiedStarterRows', 17,
      'teamCount', 2, 'detailRows', 44, 'invalidDetailRows', 0
    ),
    statement_timestamp()
  ) ->> 'coverageOutcome',
  'quarantined',
  'a previously-accepted fixture can be re-quarantined by a corrected payload'
);
reset role;
-- (7a) still exactly one coverage row, now carrying the CORRECTED (quarantine-call) audit values.
select extensions.is(
  (select count(*)::integer from app_private.historical_performance_fixture_coverage
   where fixture_id = '52000000-0000-4000-8000-000000000004'),
  1,
  'accept -> quarantine leaves exactly one coverage row for fixture 4, never a second one'
);
select extensions.is(
  (select row(lineup_rows_seen, valid_player_rows, excluded_incomplete_rows, coverage_outcome, quarantine_reason)
   from app_private.historical_performance_fixture_coverage
   where fixture_id = '52000000-0000-4000-8000-000000000004'),
  row(27::integer, 22::integer, 5::integer, 'quarantined'::text, 'anonymous_starter_rows_exceeded'::text),
  'the single row now carries the CORRECTED quarantine-call coverage values, not the original accepted-call ones'
);
-- (7b) the fixture's performance rows (from the original accepted attempt) are all deactivated.
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id = '52000000-0000-4000-8000-000000000004' and active),
  0,
  'fixture 4''s previously-active performance rows are all deactivated once it is re-quarantined'
);

-- (7c) the rating-input aggregate now excludes fixture 4 too: 4 finished fixtures, 2 quarantined
-- (3 and 4), expected 2, performanceCount still exactly 44 (fixtures 1 and 2 only).
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.football_historical_player_rating_inputs('sportsmonks', '28001') ->> 'quarantinedFixtureCount',
  '2',
  'both fixture 3 and the newly re-quarantined fixture 4 are counted as quarantined'
);
select extensions.is(
  api.football_historical_player_rating_inputs('sportsmonks', '28001') ->> 'expectedFixtureCount',
  '2',
  'expected fixture count drops to 2 (4 finished minus 2 quarantined)'
);
select extensions.is(
  api.football_historical_player_rating_inputs('sportsmonks', '28001') ->> 'performanceCount',
  '44',
  'performanceCount is unaffected by fixture 4''s re-quarantine: still exactly fixtures 1 and 2'
);

-- (7d) idempotent re-quarantine of fixture 4.
select extensions.is(
  api.quarantine_historical_player_fixture_performance(
    'sportsmonks', '28001', '19800004',
    'sportsmonks-fixture:' || repeat('3', 64),
    jsonb_build_object(
      'lineupRowsSeen', 27, 'validPlayerRows', 22, 'excludedIncompleteRows', 5,
      'anonymousStarterRows', 5, 'identifiedStarterRows', 17,
      'teamCount', 2, 'detailRows', 44, 'invalidDetailRows', 0
    ),
    statement_timestamp()
  ) ->> 'coverageOutcome',
  'quarantined',
  'repeat-quarantining fixture 4 with the same facts is safe'
);
reset role;
select extensions.is(
  (select count(*)::integer from app_private.historical_performance_fixture_coverage
   where fixture_id = '52000000-0000-4000-8000-000000000004'),
  1,
  'idempotent re-quarantine of fixture 4 does not duplicate the coverage row'
);

-- (7e) accepting the SAME fixture afterward via a corrected, clean ingest call flips
-- coverage_outcome back to accepted and clears quarantine_reason, without creating a second row.
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.ingest_historical_player_fixture_performance(
    'sportsmonks', '28001', '19800004',
    'sportsmonks-fixture:' || repeat('4', 64),
    (
      select jsonb_agg(jsonb_build_object(
        'externalPlayerId', (80000 + number)::text,
        'externalTeamId', case when number <= 11 then '68001' else '68002' end,
        'started', true, 'appeared', true, 'minutes', 90,
        'goals', 0, 'assists', 0, 'cleanSheets', 0, 'goalsConceded', 0, 'saves', 0,
        'penaltiesSaved', 0, 'penaltiesMissed', 0, 'yellowCards', 0, 'redCards', 0,
        'secondYellowDismissals', 0, 'ownGoals', 0, 'providerRating', 6.5
      ) order by number)
      from generate_series(1, 22) number
    ),
    jsonb_build_object(
      'lineupRowsSeen', 22, 'validPlayerRows', 22, 'excludedIncompleteRows', 0,
      'starterRows', 22, 'anonymousStarterRows', 0, 'identifiedStarterRows', 22,
      'teamCount', 2, 'detailRows', 44, 'invalidDetailRows', 0
    ),
    statement_timestamp()
  ) ->> 'active',
  '22',
  'fixture 4 is accepted again by a further-corrected, clean payload'
);
reset role;
select extensions.is(
  (select count(*)::integer from app_private.historical_performance_fixture_coverage
   where fixture_id = '52000000-0000-4000-8000-000000000004'),
  1,
  'accept -> quarantine -> accept still leaves exactly one coverage row for fixture 4'
);
select extensions.is(
  (select row(coverage_outcome, quarantine_reason)
   from app_private.historical_performance_fixture_coverage
   where fixture_id = '52000000-0000-4000-8000-000000000004'),
  row('accepted'::text, null::text),
  'accepting fixture 4 again flips coverage_outcome back to accepted and clears quarantine_reason'
);
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id = '52000000-0000-4000-8000-000000000004' and active),
  22,
  'fixture 4''s 22 rows are active again after being accepted a second time'
);

-- Final rating-input snapshot: 4 finished fixtures, 1 quarantined (3 only, since 4 ended accepted
-- again), expected 3, performanceCount 66 (fixtures 1, 2 and 4).
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.football_historical_player_rating_inputs('sportsmonks', '28001') ->> 'quarantinedFixtureCount',
  '1',
  'only fixture 3 remains quarantined once fixture 4 is accepted again'
);
select extensions.is(
  api.football_historical_player_rating_inputs('sportsmonks', '28001') ->> 'expectedFixtureCount',
  '3',
  'expected fixture count is back up to 3 (4 finished minus the 1 still-quarantined fixture 3)'
);
select extensions.is(
  api.football_historical_player_rating_inputs('sportsmonks', '28001') ->> 'performanceCount',
  '66',
  'performanceCount now includes fixture 4''s 22 rows alongside fixtures 1 and 2 (66, not 44 or 88)'
);
reset role;

-- ---------------------------------------------------------------------------
-- Owner addendum (second correction, 2026-09-19), item 2: the tables this migration modifies are
-- SHARED with the live current-season path (a distinct source_version prefix,
-- 'sportsmonks-current-fixture:', from 20260914200726_current_finished_fixture_performances.sql).
-- Prove the new CHECK constraint is a hard DB-level guarantee -- not an accident of column
-- defaults -- that only the historical 'sportsmonks-fixture:' prefix can ever carry a nonzero
-- anonymous-starter count.
-- ---------------------------------------------------------------------------

insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id,
  kickoff_at, status, period, home_score, away_score,
  provider_updated_at, source_sequence, source_version, finalized_at
) values (
  '52000000-0000-4000-8000-000000000005',
  '32000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000002',
  '2025-02-07T18:00:00Z', 'finished', 'post_match', 1, 1,
  '2025-02-07T20:00:00Z', 1, 'sportsmonks:test-fixture-5:v1',
  '2025-02-07T20:00:00Z'
);

-- These are direct manipulations of the underlying table (not through any service-role RPC), so
-- they run as the test's own (superuser, RLS-exempt) role -- the same role every other direct
-- SELECT against this force-RLS-protected table already uses elsewhere in this file.

-- A row shaped exactly like the current-season ingestion path would produce (source_version
-- matching sportsmonks-current-fixture:..., anonymous_starter_rows at its default of 0) still
-- satisfies every constraint on the table, unchanged from before this migration.
select extensions.lives_ok(
  $$insert into app_private.historical_performance_fixture_coverage (
    fixture_id, football_season_id, source_provider, source_version,
    lineup_rows_seen, valid_player_rows, excluded_incomplete_rows,
    starter_rows, team_count, detail_rows, invalid_detail_rows,
    performance_rows, reconciled, provider_observed_at
  ) values (
    '52000000-0000-4000-8000-000000000005',
    '42000000-0000-4000-8000-000000000001',
    'sportsmonks',
    'sportsmonks-current-fixture:' || repeat('1', 64),
    22, 22, 0, 22, 2, 44, 0, 22, true, statement_timestamp()
  )$$,
  'a current-season-shaped row (anonymous_starter_rows at its default of 0) still inserts cleanly'
);
select extensions.is(
  (select anonymous_starter_rows from app_private.historical_performance_fixture_coverage
   where fixture_id = '52000000-0000-4000-8000-000000000005'),
  0,
  'the current-season-shaped row keeps anonymous_starter_rows at its default of 0'
);
select extensions.is(
  (select coverage_outcome from app_private.historical_performance_fixture_coverage
   where fixture_id = '52000000-0000-4000-8000-000000000005'),
  'accepted',
  'the current-season-shaped row keeps coverage_outcome at its default of accepted'
);

-- An attempt to give that SAME current-season-prefixed row a nonzero anonymous-starter count is
-- REJECTED by the new constraint -- proving the scoping is enforced, not coincidental.
select extensions.throws_ok(
  $$update app_private.historical_performance_fixture_coverage
    set anonymous_starter_rows = 3, identified_starter_rows = 19
    where fixture_id = '52000000-0000-4000-8000-000000000005'$$,
  '23514',
  null,
  'a current-season-prefixed row can never carry a nonzero anonymous-starter count'
);
-- Also rejected via the same insert-on-conflict path the RPCs themselves use (not just a bare
-- update), against fixture 5's existing row.
select extensions.throws_ok(
  $$insert into app_private.historical_performance_fixture_coverage (
    fixture_id, football_season_id, source_provider, source_version,
    lineup_rows_seen, valid_player_rows, excluded_incomplete_rows,
    anonymous_starter_rows, identified_starter_rows,
    starter_rows, team_count, detail_rows, invalid_detail_rows,
    performance_rows, reconciled, provider_observed_at
  ) values (
    '52000000-0000-4000-8000-000000000005',
    '42000000-0000-4000-8000-000000000001',
    'sportsmonks',
    'sportsmonks-current-fixture:' || repeat('2', 64),
    22, 22, 0, 3, 19, 22, 2, 44, 0, 22, true, statement_timestamp()
  ) on conflict (fixture_id) do update set
    source_version = excluded.source_version,
    anonymous_starter_rows = excluded.anonymous_starter_rows,
    identified_starter_rows = excluded.identified_starter_rows$$,
  '23514',
  null,
  'a current-season-prefixed insert/upsert with a nonzero anonymous-starter count is rejected outright'
);

select * from extensions.finish();
rollback;
