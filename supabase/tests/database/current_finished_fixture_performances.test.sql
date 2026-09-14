begin;
select extensions.no_plan();

select extensions.ok(
  not has_function_privilege('anon', signature, 'execute')
  and not has_function_privilege('authenticated', signature, 'execute')
  and has_function_privilege('service_role', signature, 'execute'),
  'only trusted services can execute ' || signature
)
from unnest(array[
  'api.football_current_performance_fixture_batch(text,text,text,integer)',
  'api.ingest_current_player_fixture_performance(text,text,text,jsonb,jsonb,timestamptz)'
]) signature;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok(
  $$select api.football_current_performance_fixture_batch('sportsmonks','28647',null,5)$$,
  '42501', 'football_service_role_required',
  'a user JWT cannot enumerate current performance work through a privileged connection'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001','[]','{}',statement_timestamp())$$,
  '42501', 'football_service_role_required',
  'a user JWT cannot persist current facts through a privileged connection'
);

-- Relative dates keep the past/future and current-season boundaries deterministic.
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('13880000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (
  '33880000-0000-4000-8000-000000000001', 'current-performance-league',
  'Current Performance League', 'CPL', 'league', '13880000-0000-4000-8000-000000000001'
);
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values
  ('43880000-0000-4000-8000-000000000001', '33880000-0000-4000-8000-000000000001',
   '2026/2027', current_date - 30, current_date + 300, 'active', true),
  ('43880000-0000-4000-8000-000000000002', '33880000-0000-4000-8000-000000000001',
   '2025/2026', current_date - 400, current_date - 100, 'completed', false);
insert into app.teams (id, slug, name, short_name, code, country_id)
values
  ('63880000-0000-4000-8000-000000000001', 'current-performance-home',
   'Current Performance Home', 'CP Home', 'CPH', '13880000-0000-4000-8000-000000000001'),
  ('63880000-0000-4000-8000-000000000002', 'current-performance-away',
   'Current Performance Away', 'CP Away', 'CPA', '13880000-0000-4000-8000-000000000001');

insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id,
  kickoff_at, status, period, home_score, away_score,
  provider_updated_at, source_sequence, source_version
)
select
  md5('current-performance-fixture-' || n)::uuid,
  '33880000-0000-4000-8000-000000000001'::uuid,
  case when n = 4 then '43880000-0000-4000-8000-000000000002'::uuid
    else '43880000-0000-4000-8000-000000000001'::uuid end,
  '63880000-0000-4000-8000-000000000001'::uuid,
  '63880000-0000-4000-8000-000000000002'::uuid,
  statement_timestamp() + case when n = 5 then interval '2 days'
    when n = 4 then interval '-200 days' else interval '-2 days' end,
  case when n = 3 then 'scheduled'::app.fixture_status else 'finished'::app.fixture_status end,
  case when n = 3 then 'pre_match'::app.fixture_period else 'post_match'::app.fixture_period end,
  case when n = 3 then null else 1 end,
  case when n = 3 then null else 0 end,
  statement_timestamp(), 1, 'current-performance-fixture-' || n
from generate_series(1, 5) n;

insert into app.players (id, slug, full_name, display_name, position)
select
  md5('current-performance-player-' || n)::uuid,
  'current-performance-player-' || n,
  'Current Performance Player ' || n,
  'CP Player ' || n,
  case when n in (1,12) then 'goalkeeper'::app.football_position
    when (n - 1) % 11 < 5 then 'defender'::app.football_position
    when (n - 1) % 11 < 9 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 22) n;
insert into app.team_memberships (player_id, team_id, season_id, shirt_number, valid_from, active)
select
  md5('current-performance-player-' || n)::uuid,
  case when n <= 11 then '63880000-0000-4000-8000-000000000001'::uuid
    else '63880000-0000-4000-8000-000000000002'::uuid end,
  '43880000-0000-4000-8000-000000000001'::uuid,
  (n - 1) % 11 + 1, current_date - 30, true
from generate_series(1, 22) n;

insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active
)
values
  ('sportsmonks','competition','860','33880000-0000-4000-8000-000000000001','cp-competition',statement_timestamp(),true),
  ('sportsmonks','season','28647','43880000-0000-4000-8000-000000000001','cp-current',statement_timestamp(),true),
  ('sportsmonks','season','26888','43880000-0000-4000-8000-000000000002','cp-historical',statement_timestamp(),true),
  ('sportsmonks','team','68801','63880000-0000-4000-8000-000000000001','cp-home',statement_timestamp(),true),
  ('sportsmonks','team','68802','63880000-0000-4000-8000-000000000002','cp-away',statement_timestamp(),true);
insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active
)
select 'sportsmonks', 'fixture', (19880000 + n)::text,
  md5('current-performance-fixture-' || n)::uuid, 'cp-fixture-' || n, statement_timestamp(), true
from generate_series(1, 5) n;
insert into app_private.football_provider_mappings (
  provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active
)
select 'sportsmonks', 'player', (88000 + n)::text,
  md5('current-performance-player-' || n)::uuid, 'cp-player-' || n, statement_timestamp(), true
from generate_series(1, 22) n;

create temp table current_performance_input as
select statement_timestamp() - interval '30 seconds' as observed_at,
  jsonb_agg(jsonb_build_object(
    'externalPlayerId', (88000 + n)::text,
    'externalTeamId', case when n <= 11 then '68801' else '68802' end,
    'started', true, 'appeared', true, 'minutes', 90,
    'goals', case when n = 11 then 1 else 0 end,
    'assists', case when n = 10 then 1 else 0 end,
    'cleanSheets', case when n <= 11 then 1 else 0 end,
    'goalsConceded', case when n <= 11 then 0 else 1 end,
    'saves', case when n in (1,12) then 3 else 0 end,
    'penaltiesSaved', 0, 'penaltiesMissed', 0,
    'yellowCards', 0, 'redCards', 0, 'secondYellowDismissals', 0,
    'ownGoals', 0, 'providerRating', null
  ) order by n) as rows,
  jsonb_build_object(
    'lineupRowsSeen',22,'validPlayerRows',22,'excludedIncompleteRows',0,
    'starterRows',22,'teamCount',2,'detailRows',264,'invalidDetailRows',0,
    'missingStatisticRows',0,'scoringStatisticsComplete',true,
    'cleanSheetSource','official_minutes_and_on_pitch_goals_conceded',
    'goalkeeperStatistics','explicit_value_or_null_canonical_position_checked_in_database'
  ) as coverage
from generate_series(1, 22) n;
create temp table current_performance_results (label text primary key, result jsonb);
grant select on current_performance_input to service_role;
grant select, insert on current_performance_results to service_role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select extensions.is(
  (select jsonb_agg(item ->> 'externalFixtureId' order by item ->> 'externalFixtureId')
   from jsonb_array_elements(api.football_current_performance_fixture_batch('sportsmonks','28647',null,5) -> 'items') item),
  '["19880001","19880002"]'::jsonb,
  'the current batch excludes historical, unfinished, and future fixtures'
);
select extensions.is(
  api.football_current_performance_fixture_batch('sportsmonks','28647',null,1) ->> 'nextCursor',
  '19880001', 'a bounded batch returns a cursor when more finished fixtures remain'
);
select extensions.is(
  api.football_current_performance_fixture_batch('sportsmonks','28647','19880001',1) -> 'items' -> 0 ->> 'externalFixtureId',
  '19880002', 'the next batch starts strictly after its fixture cursor'
);
select extensions.is(
  api.football_current_performance_fixture_batch('sportsmonks','28647','19880001',1) ->> 'hasMore',
  'false', 'the final page reports no remaining work'
);
select extensions.throws_ok(
  $$select api.football_current_performance_fixture_batch('sportsmonks','26888',null,5)$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'the current batch rejects a historical season argument'
);
select extensions.throws_ok(
  $$select api.football_current_performance_fixture_batch('sportsmonks','28647',null,11)$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', 'the current batch enforces its maximum page size'
);

insert into current_performance_results
select 'initial', api.ingest_current_player_fixture_performance(
  'sportsmonks','28647','19880001',rows,coverage,observed_at
) from current_performance_input;
select extensions.is(
  (select result ->> 'active' from current_performance_results where label='initial'),
  '22', '22 explicit current player fact rows reconcile'
);
select extensions.is(
  (select result ->> 'scoringStatisticsComplete' from current_performance_results where label='initial'),
  'true', 'only the strict current import certifies scoring-statistic coverage'
);
select extensions.is(
  api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001',
    (select rows from current_performance_input),(select coverage from current_performance_input),
    (select observed_at from current_performance_input)),
  (select result from current_performance_results where label='initial'),
  'an identical observation replay returns the same immutable source version'
);
reset role;
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id=md5('current-performance-fixture-1')::uuid),
  22, 'replay does not duplicate performance rows'
);
select extensions.ok(
  (select scoring_statistics_complete and reconciled and performance_rows=22
   from app_private.historical_performance_fixture_coverage
   where fixture_id=md5('current-performance-fixture-1')::uuid),
  'persisted coverage certifies the exact active set'
);

create temp table current_performance_replay_snapshot as
select jsonb_agg(to_jsonb(performance) order by performance.id) as rows
from app.player_fixture_performances performance
where performance.fixture_id=md5('current-performance-fixture-1')::uuid;

set local role service_role;
select extensions.is(
  api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001',
    (select rows from current_performance_input),(select coverage from current_performance_input),
    (select observed_at+interval '0.5 seconds' from current_performance_input)),
  (select result from current_performance_results where label='initial'),
  'a newer observation of identical facts retains the same immutable source version'
);
reset role;
select extensions.is(
  (select jsonb_agg(to_jsonb(performance) order by performance.id)
   from app.player_fixture_performances performance
   where performance.fixture_id=md5('current-performance-fixture-1')::uuid),
  (select rows from current_performance_replay_snapshot),
  'identical newer observations leave every fact row and timestamp unchanged'
);
select extensions.is(
  (select provider_observed_at from app_private.historical_performance_fixture_coverage
   where fixture_id=md5('current-performance-fixture-1')::uuid),
  (select observed_at+interval '0.5 seconds' from current_performance_input),
  'identical newer observations still advance the stale-observation watermark'
);

set local role service_role;
insert into current_performance_results
select 'correction', api.ingest_current_player_fixture_performance(
  'sportsmonks','28647','19880001',jsonb_set(rows,'{10,goals}','2'),coverage,
  observed_at+interval '1 second'
) from current_performance_input;
select extensions.isnt(
  (select result ->> 'sourceVersion' from current_performance_results where label='correction'),
  (select result ->> 'sourceVersion' from current_performance_results where label='initial'),
  'a correction receives a different payload-derived source version'
);
reset role;
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id=md5('current-performance-fixture-1')::uuid and active),
  22, 'a correction leaves exactly one active set of 22 player facts'
);
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id=md5('current-performance-fixture-1')::uuid and not active
     and source_version=(select result ->> 'sourceVersion' from current_performance_results where label='initial')),
  22, 'the superseded source set remains retained and inactive'
);
select extensions.is(
  (select goals from app.player_fixture_performances
   where fixture_id=md5('current-performance-fixture-1')::uuid
     and player_id=md5('current-performance-player-11')::uuid and active),
  2, 'the active facts contain the corrected provider value'
);

create temp table current_performance_snapshot as
select
  (select jsonb_agg(to_jsonb(performance) order by performance.id)
   from app.player_fixture_performances performance
   where performance.fixture_id=md5('current-performance-fixture-1')::uuid) as rows,
  (select to_jsonb(coverage) from app_private.historical_performance_fixture_coverage coverage
   where coverage.fixture_id=md5('current-performance-fixture-1')::uuid) as coverage;

set local role service_role;
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001',rows,coverage,observed_at)
    from current_performance_input$$,
  'P0001','STALE_UPDATE','an older observation cannot overwrite the correction'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001',rows,coverage,observed_at+interval '1 second')
    from current_performance_input$$,
  'P0001','SOURCE_OBSERVATION_CONFLICT','one observation timestamp cannot identify conflicting payloads'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001',
    rows #- '{21,goals}',coverage,observed_at+interval '2 seconds') from current_performance_input$$,
  '22023','CURRENT_PERFORMANCE_INCOMPLETE','a late player row with an omitted scoring statistic is rejected'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001',
    jsonb_set(rows,'{21,goals}','null'),coverage,observed_at+interval '2 seconds') from current_performance_input$$,
  '22023','CURRENT_PERFORMANCE_INCOMPLETE','a null goal count remains unknown and cannot become zero'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001',
    jsonb_set(rows,'{0,saves}','null'),coverage,observed_at+interval '2 seconds') from current_performance_input$$,
  '22023','CURRENT_POSITION_STATISTICS_INCOMPLETE','an explicit null goalkeeper saves statistic is not converted to zero'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001',
    jsonb_set(rows,'{11,penaltiesSaved}','null'),coverage,observed_at+interval '2 seconds') from current_performance_input$$,
  '22023','CURRENT_POSITION_STATISTICS_INCOMPLETE','a goalkeeper must also have an explicit penalties-saved value'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001',
    rows,coverage-'scoringStatisticsComplete',observed_at+interval '2 seconds') from current_performance_input$$,
  '22023','CURRENT_PERFORMANCE_INCOMPLETE','facts without the explicit scoring coverage marker are rejected'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001',
    rows,jsonb_set(coverage,'{missingStatisticRows}','1'),observed_at+interval '2 seconds') from current_performance_input$$,
  '22023','CURRENT_PERFORMANCE_INCOMPLETE','coverage cannot certify a snapshot with missing statistics'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001',
    rows,coverage-'cleanSheetSource',observed_at+interval '2 seconds') from current_performance_input$$,
  '22023','CURRENT_PERFORMANCE_INCOMPLETE','clean-sheet derivation requires explicit source provenance'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001',
    jsonb_set(rows,'{0,minutes}','59'),coverage,observed_at+interval '2 seconds') from current_performance_input$$,
  '22023','INVALID_PROVIDER_PAYLOAD','59 minutes cannot support a clean-sheet award'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001',
    jsonb_set(rows,'{21,cleanSheets}','1'),coverage,observed_at+interval '2 seconds') from current_performance_input$$,
  '22023','INVALID_PROVIDER_PAYLOAD','a player who conceded on the pitch cannot receive a clean-sheet award'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880001',
    jsonb_set(rows,'{21,externalPlayerId}','"88999"'),coverage,observed_at+interval '2 seconds') from current_performance_input$$,
  'P0002','PLAYER_MAPPING_NOT_FOUND','one unmapped player rejects the whole current snapshot instead of quarantine'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880003',rows,coverage,observed_at)
    from current_performance_input$$,
  '22023','FINISHED_CURRENT_FIXTURE_REQUIRED','unfinished current fixtures cannot receive settled player facts'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880004',rows,coverage,observed_at)
    from current_performance_input$$,
  '22023','FINISHED_CURRENT_FIXTURE_REQUIRED','a historical fixture cannot be imported under the current season'
);
select extensions.throws_ok(
  $$select api.ingest_current_player_fixture_performance('sportsmonks','28647','19880005',rows,coverage,observed_at)
    from current_performance_input$$,
  '22023','FINISHED_CURRENT_FIXTURE_REQUIRED','a future fixture is rejected even if its stored state says finished'
);
select extensions.throws_ok(
  $$select api.ingest_historical_player_fixture_performance('sportsmonks','28647','19880001',
    'sportsmonks-fixture:'||repeat('a',64),rows,coverage,observed_at) from current_performance_input$$,
  '22023','COMPLETED_SEASON_REQUIRED','the historical RPC cannot bypass strict current-season ingestion'
);
reset role;
select extensions.is(
  (select jsonb_agg(to_jsonb(performance) order by performance.id)
   from app.player_fixture_performances performance
   where performance.fixture_id=md5('current-performance-fixture-1')::uuid),
  (select rows from current_performance_snapshot),
  'every rejected snapshot preserves all active and superseded facts atomically'
);
select extensions.is(
  (select to_jsonb(coverage) from app_private.historical_performance_fixture_coverage coverage
   where coverage.fixture_id=md5('current-performance-fixture-1')::uuid),
  (select coverage from current_performance_snapshot),
  'rejections preserve the last successful coverage and observation timestamp'
);
select extensions.is(
  (select count(*)::integer from app.player_fixture_performances
   where fixture_id<>md5('current-performance-fixture-1')::uuid),
  0, 'out-of-scope fixtures acquire no performance rows'
);

set local role service_role;
select extensions.is(
  api.ingest_current_player_fixture_performance('sportsmonks','28647','19880002',
    (select jsonb_set(jsonb_set(rows,'{1,saves}','null'),'{1,penaltiesSaved}','null') from current_performance_input),
    (select coverage from current_performance_input),(select observed_at from current_performance_input)) ->> 'active',
  '22', 'known canonical outfield players may preserve null goalkeeper-only statistics'
);
reset role;
select extensions.ok(
  (select saves is null and penalties_saved is null
   from app.player_fixture_performances
   where fixture_id=md5('current-performance-fixture-2')::uuid
     and player_id=md5('current-performance-player-2')::uuid and active),
  'irrelevant goalkeeper statistics remain null instead of being manufactured as zero'
);

select extensions.is(
  (select scoring_statistics_complete from app_private.historical_performance_fixture_coverage
   where fixture_id=md5('current-performance-fixture-2')::uuid),
  true, 'the secondary fixture initially has strict current scoring coverage'
);
set local role service_role;
update app_private.historical_performance_fixture_coverage
set source_version='sportsmonks-fixture:'||repeat('b',64)
where fixture_id=md5('current-performance-fixture-2')::uuid;
reset role;
select extensions.is(
  (select scoring_statistics_complete from app_private.historical_performance_fixture_coverage
   where fixture_id=md5('current-performance-fixture-2')::uuid),
  false, 'a later historical source update cannot inherit the current scoring completeness marker'
);

select * from extensions.finish();
rollback;
