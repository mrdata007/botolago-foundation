begin;
select extensions.no_plan();

select extensions.ok(app_private.fantasy_actual_ratings_pending(
  '{"scoringVersion":3,"ratingScoring":true,"ruleset":{"version":3},"playerFixtures":[{"stats":{"minutes":1},"rating":null}]}'),
  'even a one-minute appearance without an API rating is pending');
select extensions.ok(app_private.fantasy_actual_ratings_pending(
  '{"scoringVersion":3,"ratingScoring":true,"ruleset":{"version":3},"playerFixtures":[{"stats":{"minutes":90}}]}'),
  'an omitted API rating is pending');
select extensions.ok(not app_private.fantasy_actual_ratings_pending(
  '{"scoringVersion":3,"ratingScoring":true,"ruleset":{"version":3},"playerFixtures":[{"stats":{"minutes":0},"rating":null},{"stats":{"minutes":90},"rating":5}]}'),
  'actual rated appearances and confirmed nonparticipants can score');
select extensions.ok(not app_private.fantasy_actual_ratings_pending(
  '{"scoringVersion":2,"adaptive":true,"ruleset":{"version":2},"playerFixtures":[{"stats":{"minutes":90}}]}'),
  'the earlier category rule is unaffected');
select extensions.ok((select prosrc like '%fantasy_actual_ratings_pending(snapshot.payload)%'
  from pg_proc where oid='api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure),
  'the server save independently enforces actual API ratings');
select extensions.ok(has_function_privilege('service_role',
  'api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute')
  and not has_function_privilege('authenticated',
  'api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)','execute'),
  'the guarded save remains service-only');

select * from extensions.finish();
rollback;
