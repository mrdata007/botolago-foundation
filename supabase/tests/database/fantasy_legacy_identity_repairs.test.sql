begin;
select extensions.no_plan();
create function pg_temp.lrid(n integer)returns uuid language sql immutable as $$
 select('f9730000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into app.countries(id,iso_alpha2,iso_alpha3)values(pg_temp.lrid(1),'MA','MAR');
insert into app.competitions(id,slug,name,short_name,competition_type,country_id)
values(pg_temp.lrid(2),'legacy-repair-test','Legacy repair','LRT','league',pg_temp.lrid(1));
insert into app.seasons(id,competition_id,label,starts_on,ends_on,status,is_current)
values(pg_temp.lrid(3),pg_temp.lrid(2),'Legacy repair',current_date-30,current_date+200,'active',true);
insert into app.teams(id,slug,name,short_name,code,country_id)
values(pg_temp.lrid(9),'legacy-repair-club','Legacy club','LRC','LRC',pg_temp.lrid(1));
insert into app.players(id,slug,full_name,display_name,position)
values(pg_temp.lrid(8),'legacy-repair-player','Legacy Player','Legacy','goalkeeper');
insert into app.fantasy_competitions(id,football_competition_id,slug,name,active)
values(pg_temp.lrid(4),pg_temp.lrid(2),'legacy-repair-test','Legacy repair',true);
insert into app.fantasy_seasons(id,fantasy_competition_id,football_season_id,ruleset_id,name,status,starts_at,ends_at)
values(pg_temp.lrid(5),pg_temp.lrid(4),pg_temp.lrid(3),'f6100000-0000-4000-8000-000000000100','Legacy repair','active',now()-interval '30 days',now()+interval '200 days');
insert into app.fantasy_gameweeks(id,fantasy_season_id,sequence_number,name,deadline_at,starts_at,ends_at,status)
values(pg_temp.lrid(6),pg_temp.lrid(5),1,'GW1',now()+interval '1 day',now()+interval '2 days',now()+interval '4 days','open');
insert into app.fantasy_players(id,fantasy_season_id,football_player_id,football_team_id,position_id,price)
select pg_temp.lrid(7),pg_temp.lrid(5),pg_temp.lrid(8),pg_temp.lrid(9),id,6 from app.fantasy_positions where code='GK';
insert into app_private.fantasy_api_rating_seasons(season_id,from_gameweek,owner_approval)
values(pg_temp.lrid(5),1,'Owner approved provider-native ratings for the test season');
select extensions.ok(not app_private.fantasy_native_player_selectable(pg_temp.lrid(7)),'an unidentified legacy player starts unavailable for a new purchase');
insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at)
values('sofascore','player','97730007',pg_temp.lrid(8),'test reviewed repair',now());
select extensions.ok(app_private.fantasy_native_player_selectable(pg_temp.lrid(7)),'a native ID alone would otherwise make the stale catalog entry purchasable');
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.lrid(n),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','legacy-repair-'||n||'@example.test',now(),'{}',jsonb_build_object('username','legacy_repair_'||n),now(),now()from generate_series(20,21)n;
insert into app.fantasy_teams(id,user_id,fantasy_season_id,current_gameweek_id,name,bank,team_value,free_transfers)
select pg_temp.lrid(n+10),pg_temp.lrid(n),pg_temp.lrid(5),pg_temp.lrid(6),'Legacy team '||n,10,90,1 from generate_series(20,21)n;
insert into app.fantasy_squad_memberships(fantasy_team_id,fantasy_player_id,purchase_price,current_sale_price,acquired_gameweek_id)
values(pg_temp.lrid(30),pg_temp.lrid(7),6,6,pg_temp.lrid(6));
select set_config('test.legacy_team_before',(select md5(to_jsonb(t)::text)from app.fantasy_teams t where id=pg_temp.lrid(30)),true);
insert into app_private.fantasy_legacy_identity_repairs(fantasy_player_id,football_player_id,api_player_id,owner_approval,identity_evidence,catalog_before,hold_reason)
select fp.id,fp.football_player_id,'97730007','Owner approved an evidence-backed legacy ID repair','{"source":"https://www.sofascore.com/football/player/test/97730007","decision":"verified identity; registration held"}',to_jsonb(fp),'Identity repair does not approve the stale club and position listing'from app.fantasy_players fp where fp.id=pg_temp.lrid(7);
select extensions.ok(not app_private.fantasy_native_player_selectable(pg_temp.lrid(7)),'the repair hold preserves the previous no-new-purchase behavior');
select extensions.is((select count(*)::integer from app.fantasy_squad_memberships where fantasy_team_id=pg_temp.lrid(30)and sold_at is null),1,'the current owner retains the selection');
select extensions.is((select md5(to_jsonb(t)::text)from app.fantasy_teams t where id=pg_temp.lrid(30)),current_setting('test.legacy_team_before'),'bank, team value and transfer allowance are byte-for-byte unchanged');
select extensions.throws_ok($$insert into app.fantasy_squad_memberships(fantasy_team_id,fantasy_player_id,purchase_price,current_sale_price,acquired_gameweek_id)values(pg_temp.lrid(31),pg_temp.lrid(7),6,6,pg_temp.lrid(6))$$,'PT400','player_not_eligible','a different manager cannot buy the held stale listing');
select set_config('request.jwt.claims','{}',true);
select extensions.ok(not exists(select 1 from jsonb_array_elements(api.fantasy_player_pool(pg_temp.lrid(5),null,null,null,null,null,null,100)->'items')p where p->>'id'=pg_temp.lrid(7)::text),'the public pool filters a repaired stale listing before pagination');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.lrid(20))::text,true);
select extensions.ok(exists(select 1 from jsonb_array_elements(api.fantasy_player_pool(pg_temp.lrid(5),null,null,null,null,null,null,100)->'items')p where p->>'id'=pg_temp.lrid(7)::text),'the existing owner can still read their own held player');
select extensions.throws_ok($$update app_private.fantasy_legacy_identity_repairs set api_player_id='97730008'where fantasy_player_id=pg_temp.lrid(7)$$,'P0001','legacy_identity_evidence_immutable','reviewed identity evidence cannot be rewritten');
select extensions.throws_ok($$delete from app_private.fantasy_legacy_identity_repairs where fantasy_player_id=pg_temp.lrid(7)$$,'P0001','legacy_identity_evidence_immutable','reviewed identity evidence cannot be deleted');
select extensions.ok(not has_table_privilege('service_role','app_private.fantasy_legacy_identity_repairs','insert'),'routine service workers cannot approve identity repairs');
select extensions.ok(not has_table_privilege('authenticated','app_private.fantasy_legacy_identity_repairs','select'),'private repair evidence is not exposed to the browser');
select *from extensions.finish();
rollback;
