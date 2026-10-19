begin;
select extensions.no_plan();
select extensions.ok(not(select enabled from app_private.fantasy_not_rated_policy where id),'Not rated automation ships disabled until the reviewed runtime is deployed');
update app_private.fantasy_not_rated_policy set enabled=true,approved_at=statement_timestamp(),owner_approval='Test owner approved the reviewed two-check 24-hour rule'where id;
create function pg_temp.nrid(n integer)returns uuid language sql immutable as $$
 select('f9720000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into app.countries(id,iso_alpha2,iso_alpha3)values(pg_temp.nrid(1),'MA','MAR');
insert into app.competitions(id,slug,name,short_name,competition_type,country_id)
values(pg_temp.nrid(2),'not-rated-test','Not rated','NRT','league',pg_temp.nrid(1));
insert into app.seasons(id,competition_id,label,starts_on,ends_on,status,is_current)
values(pg_temp.nrid(3),pg_temp.nrid(2),'Not rated season',current_date-30,current_date+200,'active',true);
insert into app.teams(id,slug,name,short_name,code,country_id)
select pg_temp.nrid(10+n),'not-rated-club-'||n,'NR Club '||n,'NR'||n,'NR'||n,pg_temp.nrid(1)from generate_series(1,2)n;
insert into app.fixtures(id,competition_id,season_id,home_team_id,away_team_id,kickoff_at,status,finalized_at,provider_updated_at,source_sequence)
values(pg_temp.nrid(20),pg_temp.nrid(2),pg_temp.nrid(3),pg_temp.nrid(11),pg_temp.nrid(12),now()-interval '50 hours','finished',now()-interval '48 hours',now(),1);
insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at,active)
values('sofascore','fixture','97710020',pg_temp.nrid(20),'test-not-rated',now(),true);
create function pg_temp.nrplayers(p_minutes integer,p_rating numeric default null)returns jsonb language sql immutable as $$
 select jsonb_agg(jsonb_build_object('externalId',(97720000+n)::text,'side',case when n<=11 then 'home'else 'away'end,
 'starter',true,'appeared',true,'uncertain',false,'minutes',case when n=1 then p_minutes else 90 end,
 'rating',case when n=1 then p_rating else 6.5 end)order by n)from generate_series(1,22)n;
$$;
insert into app_private.fantasy_api_rating_sources(fixture_id,event_id,digest,players,ready,captured_at,created_at)
values(pg_temp.nrid(20),'97710020',encode(extensions.digest(pg_temp.nrplayers(7)::text,'sha256'),'hex'),pg_temp.nrplayers(7),false,now()-interval '25 hours',now()-interval '25 hours');
select set_config('test.nr_source',(select id::text from app_private.fantasy_api_rating_sources where fixture_id=pg_temp.nrid(20)),true);
insert into app_private.fantasy_rating_checks(source_id,checked_at,provenance)
values(current_setting('test.nr_source')::bigint,now()-interval '25 hours','source_receipt');
select extensions.is(app_private.fantasy_settle_not_rated(current_setting('test.nr_source')::bigint),0,'one successful read never settles an unrated appearance');

savepoint too_soon;
insert into app_private.fantasy_rating_checks(source_id,checked_at,provenance)
values(current_setting('test.nr_source')::bigint,now()-interval '2 hours','live_receipt');
select extensions.is(app_private.fantasy_settle_not_rated(current_setting('test.nr_source')::bigint),0,'two checks only 23h apart remain pending');
rollback to too_soon;

select set_config('request.jwt.claims','{"role":"service_role"}',true);
select api.service_record_fantasy_api_ratings(pg_temp.nrid(20),'97710020',pg_temp.nrplayers(7),statement_timestamp());
select extensions.ok((select ready from app_private.fantasy_api_rating_sources where id=current_setting('test.nr_source')::bigint),'second valid live API receipt after 24h makes the source ready');
select extensions.is((select count(*)::integer from app_private.fantasy_not_rated_settlements where source_id=current_setting('test.nr_source')::bigint),1,'only the single short unrated appearance settles');
select extensions.ok((select players->0->'rating'='null'::jsonb from app_private.fantasy_api_rating_sources where id=current_setting('test.nr_source')::bigint),'the original provider rating remains NULL');
select extensions.is((select minutes from app_private.fantasy_not_rated_settlements where source_id=current_setting('test.nr_source')::bigint),7,'actual participation minutes remain seven');
select extensions.ok(app_private.fantasy_not_rated_evidence(current_setting('test.nr_source')::bigint,'97720001')is not null,'settlement exposes both successful-read timestamps');
select extensions.is(app_private.fantasy_settle_not_rated(current_setting('test.nr_source')::bigint),0,'repeating settlement is idempotent');

create function pg_temp.nr_doc(p_proof jsonb)returns jsonb language sql stable as $$
 select jsonb_build_object('scoringVersion',3,'ratingScoring',true,'apiNativeRatings',true,'ruleset',jsonb_build_object('version',3),
 'fixtures',jsonb_build_array(jsonb_build_object('fixtureId',pg_temp.nrid(20),'apiRatingSourceId',current_setting('test.nr_source')::bigint)),
 'playerFixtures',jsonb_build_array(jsonb_build_object('fixtureId',pg_temp.nrid(20),'providerPlayerId','97720001','apiAppeared',true,
 'apiNotRated',true,'participationKnown',true,'notRatedEvidence',p_proof,'rating',null,'stats',jsonb_build_object('minutes',7))));
$$;
select extensions.ok(not app_private.fantasy_actual_ratings_pending(pg_temp.nr_doc(app_private.fantasy_not_rated_evidence(current_setting('test.nr_source')::bigint,'97720001'))),'database independently accepts the matching ledger proof');
select extensions.ok(app_private.fantasy_actual_ratings_pending(pg_temp.nr_doc('{"policyVersion":1,"sourceId":999}')),'a forged Not rated flag/proof cannot bypass pending');
select extensions.ok(app_private.fantasy_actual_ratings_pending(pg_temp.nr_doc(null)),'missing proof stays pending');

-- A longer unrated appearance cannot use the old seven-minute proof.
select api.service_record_fantasy_api_ratings(pg_temp.nrid(20),'97710020',pg_temp.nrplayers(10),statement_timestamp());
select extensions.ok(not(select ready from app_private.fantasy_api_rating_sources where fixture_id=pg_temp.nrid(20)order by id desc limit 1),'a changed ten-minute appearance remains pending');
select extensions.ok(not exists(select 1 from app_private.fantasy_not_rated_settlements d join app_private.fantasy_api_rating_sources s on s.id=d.source_id where s.fixture_id=pg_temp.nrid(20)and s.id<>(current_setting('test.nr_source')::bigint)),'no settlement is invented for longer participation');

-- A genuine rating is retained, with no zero-rating substitution.
select api.service_record_fantasy_api_ratings(pg_temp.nrid(20),'97710020',pg_temp.nrplayers(7,7.5),statement_timestamp());
select extensions.ok((select ready from app_private.fantasy_api_rating_sources where fixture_id=pg_temp.nrid(20)order by id desc limit 1),'a later actual rating is ready through the normal source path');
select extensions.is((select(players->0->>'rating')::numeric from app_private.fantasy_api_rating_sources where fixture_id=pg_temp.nrid(20)order by id desc limit 1),7.5::numeric,'later actual 7.5 is never replaced by zero');
select extensions.is((select count(*)::integer from app_private.fantasy_not_rated_settlements where source_id=current_setting('test.nr_source')::bigint),1,'the old decision stays auditable after a real rating arrives');
select extensions.ok(not has_table_privilege('authenticated','app_private.fantasy_not_rated_settlements','insert'),'browser cannot create settlement evidence');
select extensions.ok(not has_function_privilege('service_role','app_private.fantasy_settle_not_rated(bigint)','execute'),'service cannot directly force settlement');
select *from extensions.finish();
rollback;
