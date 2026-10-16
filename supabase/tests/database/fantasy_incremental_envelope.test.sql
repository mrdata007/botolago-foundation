begin;
set local search_path=public,extensions;
select extensions.plan(20);

-- Synthetic envelopes only: no production or personal data is required.
-- This wrapper validates envelope shape, not individual player schemas.
with base as (
  select '{"incremental":true,"fixtures":[],"pendingFixtures":[{}],"players":[{}],"playerFixtures":[]}'::jsonb d
), cases(i,label,d) as (
  select 1,'SQL NULL',null::jsonb
  union all select 2,'JSON null','null'::jsonb
  union all select 3,'array document','[]'::jsonb
  union all select 4,'string incremental flag',jsonb_set(d,'{incremental}','"true"') from base
  union all select 5,'missing arrays','{"incremental":true,"fixtures":[]}'::jsonb
  union all select 6,'null players',jsonb_set(d,'{players}','null') from base
  union all select 7,'object players',jsonb_set(d,'{players}','{}') from base
  union all select 8,'null fixtures',jsonb_set(d,'{fixtures}','null') from base
  union all select 9,'null pending fixtures',jsonb_set(d,'{pendingFixtures}','null') from base
  union all select 10,'null player fixtures',jsonb_set(d,'{playerFixtures}','null') from base
  union all select 11,'empty pending fixtures',jsonb_set(d,'{pendingFixtures}','[]') from base
  union all select 12,'empty players',jsonb_set(d,'{players}','[]') from base
  union all select 13,'65 pending fixtures',jsonb_set(d,'{pendingFixtures}',(select jsonb_agg('{}'::jsonb) from generate_series(1,65))) from base
  union all select 14,'2001 players',jsonb_set(d,'{players}',(select jsonb_agg('{}'::jsonb) from generate_series(1,2001))) from base
  union all select 15,'unexpected player fixture',jsonb_set(d,'{playerFixtures}','[{}]') from base
  union all select 16,'object fixtures',jsonb_set(d,'{fixtures}','{}') from base
)
select extensions.throws_ok(
  format('select app_private.fantasy_validate_scoring_document(%L::jsonb)',d),
  'PT409','fantasy_scoring_input_incomplete',label||' rejected with stable error'
) from cases order by i;

select extensions.lives_ok(
  $$select app_private.fantasy_validate_scoring_document('{"incremental":true,"fixtures":[],"pendingFixtures":[{}],"players":[{}],"playerFixtures":[]}'::jsonb)$$,
  'valid all-pending envelope remains provisional'
);
with base as (
  select '{"incremental":true,"fixtures":[],"pendingFixtures":[{}],"players":[{}],"playerFixtures":[]}'::jsonb d
)
select extensions.lives_ok(
  format('select app_private.fantasy_validate_scoring_document(%L::jsonb)',
    jsonb_set(jsonb_set(d,'{players}',(select jsonb_agg('{}'::jsonb) from generate_series(1,2000))),
      '{pendingFixtures}',(select jsonb_agg('{}'::jsonb) from generate_series(1,64)))),
  'valid upper capacity boundaries accepted'
) from base;
select extensions.ok(
  not app_private.fantasy_field_certified('{"stats":{"minutes":0},"evidence":{"minutes":{"state":"unknown"}}}'::jsonb,'minutes'),
  'unknown zero minutes not certified'
);
select extensions.ok(
  app_private.fantasy_field_certified('{"stats":{"minutes":0},"evidence":{"minutes":{"state":"verified","source":"test-reference","observedAt":"2026-09-30T00:00:00Z","references":["synthetic-test"]}}}'::jsonb,'minutes'),
  'verified zero minutes distinguishable from missing data'
);
select * from extensions.finish();
rollback;
