begin;
select extensions.no_plan();

insert into app.countries(id,iso_alpha2,iso_alpha3)
values ('fa000000-0000-4000-8000-000000000001','MA','MAR');
insert into app.competitions(id,slug,name,competition_type,country_id)
values ('fa100000-0000-4000-8000-000000000001','verified-finalization','Verified finalization','league',
  'fa000000-0000-4000-8000-000000000001');
insert into app.seasons(id,competition_id,label,starts_on,ends_on,status,is_current)
values ('fa200000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001',
  '2089/90','2089-08-01','2090-06-30','active',true);
insert into app.rounds(id,season_id,round_number,name,status)
values ('fa300000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001',1,'GW1','active');
insert into app.fantasy_competitions(id,football_competition_id,slug,name,active)
values ('fa600000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001',
  'verified-finalization','Verified finalization',true);
insert into app.fantasy_seasons(id,fantasy_competition_id,football_season_id,ruleset_id,name,status,starts_at,ends_at)
values ('fa630000-0000-4000-8000-000000000001','fa600000-0000-4000-8000-000000000001',
  'fa200000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000100',
  '2089/90','active','2089-08-01','2090-06-30');
insert into app.fantasy_gameweeks(id,fantasy_season_id,football_round_id,sequence_number,name,
  deadline_at,starts_at,ends_at,status)
values ('fa640000-0000-4000-8000-000000000001','fa630000-0000-4000-8000-000000000001',
  'fa300000-0000-4000-8000-000000000001',1,'GW1',
  '2090-01-01T11:00:00Z','2090-01-01T12:00:00Z','2090-01-08T12:00:00Z','provisional');

select extensions.ok(not has_function_privilege('anon',
  'api.service_finalize_fantasy_team_results(uuid,bigint,uuid,integer)','EXECUTE'),
  'anonymous clients cannot finalize team results');
select extensions.ok(not has_function_privilege('authenticated',
  'api.service_complete_fantasy_gameweek(uuid,bigint)','EXECUTE'),
  'authenticated clients cannot complete a gameweek');

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select extensions.throws_ok($$select api.service_finalize_fantasy_team_results(
  'fa640000-0000-4000-8000-000000000001',1)$$,
  'PT409','gameweek_not_finalizable','provisional state cannot bypass the scoring seal');
select extensions.throws_ok($$select api.service_finalize_fantasy_team_results(
  'fa640000-0000-4000-8000-000000000001',null)$$,
  'PT400','validation_failed','a null calculation version is rejected');
select extensions.throws_ok($$select api.service_finalize_fantasy_team_results(
  'fa640000-0000-4000-8000-000000000001',1,null,null)$$,
  'PT400','validation_failed','an unbounded null batch size is rejected');
select extensions.throws_ok($$select api.service_complete_fantasy_gameweek(
  'fa640000-0000-4000-8000-000000000001',0)$$,
  'PT400','validation_failed','completion rejects an invalid calculation version');
reset role;

update app.fantasy_gameweeks set status='finalizing'
where id='fa640000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.throws_ok($$select api.service_finalize_fantasy_team_results(
  'fa640000-0000-4000-8000-000000000001',1)$$,
  'PT409','fantasy_scoring_snapshot_missing','empty result batches cannot finalize without source evidence');
select extensions.throws_ok($$select api.service_complete_fantasy_gameweek(
  'fa640000-0000-4000-8000-000000000001',1)$$,
  'PT409','fantasy_scoring_snapshot_missing','zero result rows are not proof of completion');
reset role;

-- An administrator can construct this deliberately unsealed test row; API
-- callers cannot access the private snapshot table. Neither entry point may
-- treat its presence alone as a successful scoring/finalization seal.
insert into app_private.fantasy_scoring_snapshots(gameweek_id,calculation_version,input_digest,payload,players_persisted)
select 'fa640000-0000-4000-8000-000000000001',1,
  encode(extensions.digest(doc::text,'sha256'),'hex'),doc,true
from (select app_private.fantasy_scoring_input_document('fa640000-0000-4000-8000-000000000001') as doc) source;
set local role service_role;
select extensions.throws_ok($$select api.service_finalize_fantasy_team_results(
  'fa640000-0000-4000-8000-000000000001',1)$$,
  'PT409','fantasy_scoring_snapshot_not_sealed','an unsealed snapshot cannot finalize results');
select extensions.throws_ok($$select api.service_complete_fantasy_gameweek(
  'fa640000-0000-4000-8000-000000000001',1)$$,
  'PT409','fantasy_scoring_snapshot_not_sealed','an unsealed snapshot cannot complete a gameweek');
select extensions.throws_ok($$select api.service_upsert_fantasy_player_points(
  'fa700000-0000-4000-8000-000000000001','fa640000-0000-4000-8000-000000000001',
  'fa950000-0000-4000-8000-000000000001','goal',4,'legacy-event:goal',1,1)$$,
  'PT409','fantasy_scoring_managed_snapshot','the legacy writer cannot alter a managed scoring snapshot');
reset role;
select extensions.is((select status::text from app.fantasy_gameweeks
  where id='fa640000-0000-4000-8000-000000000001'),'finalizing',
  'rejected completion leaves the gameweek state unchanged');

-- No-op retries do not reopen finalized points when a later source correction
-- exists; corrections require the separately reviewed correction lifecycle.
update app.fantasy_gameweeks set status='finalized',points_state='final',
  finalized_at=statement_timestamp(),scoring_input_version=1
where id='fa640000-0000-4000-8000-000000000001';
set local role service_role;
select extensions.is(api.service_finalize_fantasy_team_results(
  'fa640000-0000-4000-8000-000000000001',1)->>'stableResult','true',
  'finalized result retries are stable no-ops');
select extensions.is(api.service_complete_fantasy_gameweek(
  'fa640000-0000-4000-8000-000000000001',1)->>'stableResult','true',
  'completed gameweek retries are stable no-ops');
reset role;

select set_config('test.bench_captain_selection',(
  select jsonb_agg(jsonb_build_object(
    'fantasy_player_id','fa700000-0000-4000-8000-'||lpad(i::text,12,'0'),
    'slot',case when i<=11 then 'starter' else 'bench' end,
    'slot_order',case when i<=11 then i else i-11 end,
    'captain',i=12,'vice_captain',i=1))::text from generate_series(1,15) i
),true);
select extensions.throws_ok($$select app_private.fantasy_validate_selection(
  'fa630000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000100',
  current_setting('test.bench_captain_selection')::jsonb)$$,
  'PT400','captain_invalid','a bench captain is rejected before team creation');
select set_config('test.bench_vice_selection',(
  select jsonb_agg(jsonb_build_object(
    'fantasy_player_id','fa700000-0000-4000-8000-'||lpad(i::text,12,'0'),
    'slot',case when i<=11 then 'starter' else 'bench' end,
    'slot_order',case when i<=11 then i else i-11 end,
    'captain',i=1,'vice_captain',i=12))::text from generate_series(1,15) i
),true);
select extensions.throws_ok($$select app_private.fantasy_validate_selection(
  'fa630000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000100',
  current_setting('test.bench_vice_selection')::jsonb)$$,
  'PT400','vice_captain_invalid','a bench vice-captain is rejected before team creation');

select * from extensions.finish();
rollback;
