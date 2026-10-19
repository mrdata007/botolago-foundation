-- P1-P6 phone QA fixture. Fresh f960 namespace; never reopens a measured round.
-- Isolated, disposable STAGING fixture. Never a production migration.
-- Reuses 120 synthetic identities plus two privately supplied confirmed owners.
-- Creates one non-login synthetic identity solely for the deleted-profile paging case.
-- All 66 provider participants rate 7.5 => 8 points each. Independently:
-- 11 starters * 8 + one captain bonus * 8 = 96; bench = 4 * 8 = 32.
begin;
set local lock_timeout='10s';
set local statement_timeout='120s';
do $$ begin
 if current_setting('botolago.release_drill',true) is distinct from 'srdrflfrfpwixsllveid' then
   raise exception 'staging_drill_target_guard'; end if;
 if exists(select 1 from cron.job where active)
 or exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>now())
 or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
 or exists(select 1 from app_private.notification_email_settings where mode<>'off' or football_live_refresh_enabled)
 or exists(select 1 from app_private.notification_push_settings where mode<>'off')
 or exists(select 1 from app_private.rivals_settings where enabled)
 or exists(select 1 from app_private.ops_alert_state where enabled)
 or exists(select 1 from app_private.manager_card_settings where compute_enabled)
 or exists(select 1 from app_private.trophy_settings where enabled)
 or exists(select 1 from app_private.ai_content_settings where enabled)
 or exists(select 1 from app_private.ai_home_story_settings where enabled)
 or exists(select 1 from app_private.ai_home_story_jobs where status='generating')
 or exists(select 1 from app_private.account_deletion_settings where enabled)
 or exists(select 1 from app_private.pepites_settings where mode<>'off')
 or exists(select 1 from app_private.prediction_settings where mode<>'off') then
   raise exception 'staging_drill_writers_not_paused'; end if;
 if jsonb_array_length(current_setting('botolago.qa_owner_ids')::jsonb)<>2 then
   raise exception 'staging_qa_requires_two_owner_ids'; end if;
 if (select count(*) from auth.users u join app.profiles p on p.id=u.id
   where u.id in(select value::uuid from jsonb_array_elements_text(current_setting('botolago.qa_owner_ids')::jsonb))
   and u.email_confirmed_at is not null and p.deleted_at is null)<>2 then
   raise exception 'staging_qa_requires_two_confirmed_test_accounts'; end if;
 if exists(select 1 from app.saved_articles where user_id in
   (select value::uuid from jsonb_array_elements_text(current_setting('botolago.qa_owner_ids')::jsonb))) then
   raise exception 'staging_qa_existing_saved_articles_refused'; end if;
 if (select count(*) from auth.users where id in
   (select md5('fantasy-load-user-'||n)::uuid from generate_series(1,120) n)
   and email like 'fantasy-load-%@staging.botolago.invalid')<>120 then
   raise exception 'staging_qa_existing_synthetic_cohort_missing'; end if;
 if exists(select 1 from app.fantasy_seasons where id='f9600000-0000-4000-8000-000000000005') then
   raise exception 'staging_drill_fixture_already_exists'; end if;
end $$;
create function pg_temp.qa_id(n integer) returns uuid language sql stable as $$
 select case when n=1 then (select id from app.countries where iso_alpha2='MA')
 else ('f9600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid end;
$$;
-- Owner ids are supplied privately as a transaction-local setting; never
-- commit their addresses/passwords or change their Auth/profile records.
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,encrypted_password,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(pg_temp.qa_id(90000),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'staging-phone-hidden@staging.botolago.invalid',now(),'','{"provider":"email","providers":["email"]}',
 '{"username":"qa_phone_hidden","display_name":"Staging Hidden QA"}',now(),now());
insert into app.profiles(id,display_name) values(pg_temp.qa_id(90000),'Staging Hidden QA') on conflict(id) do nothing;
create temporary table qa_actors(n integer primary key,user_id uuid unique) on commit drop;
insert into qa_actors
select n,case when n<=2 then (current_setting('botolago.qa_owner_ids')::jsonb->>(n-1))::uuid
 when n=70 then pg_temp.qa_id(90000)
 else md5('fantasy-load-user-'||(case when n<70 then n-2 else n-3 end))::uuid end
from generate_series(1,123) n;
create temporary table qa_private_invite(code text) on commit drop;
insert into qa_private_invite values(upper(encode(extensions.gen_random_bytes(16),'hex')));
insert into app.competitions(id,slug,name,short_name,competition_type,country_id)
values(pg_temp.qa_id(2),'staging-phone-qa-20261019','Staging Phone QA','DRILL','league',pg_temp.qa_id(1));
insert into app.seasons(id,competition_id,label,starts_on,ends_on,status,is_current)
values(pg_temp.qa_id(3),pg_temp.qa_id(2),'2026 Staging Phone QA',current_date-7,current_date+30,'active',false);
insert into app.rounds(id,season_id,round_number,name,status)
values(pg_temp.qa_id(11),pg_temp.qa_id(3),1,'Drill GW1','completed'),
 (pg_temp.qa_id(12),pg_temp.qa_id(3),2,'Drill GW2','planned');
insert into app.teams(id,slug,name,short_name,code,country_id)
select pg_temp.qa_id(100+c),'staging-phone-qa-club-'||c,'Staging Phone QA Club '||c,'DC'||c,'DC'||c,pg_temp.qa_id(1)
from generate_series(0,5) c;
insert into app.players(id,slug,full_name,display_name,position)
select pg_temp.qa_id(1000+i),'staging-phone-qa-player-'||i,'Drill Player '||i,'DP'||i,
 case when i%11=0 then 'goalkeeper'::app.football_position
 when i%11 between 1 and 4 then 'defender'::app.football_position
 when i%11 between 5 and 8 then 'midfielder'::app.football_position
 else 'forward'::app.football_position end from generate_series(0,65) i;
insert into app.team_memberships(player_id,team_id,season_id,valid_from)
select pg_temp.qa_id(1000+i),pg_temp.qa_id(100+i/11),pg_temp.qa_id(3),current_date-7 from generate_series(0,65) i;
insert into app.fantasy_competitions(id,football_competition_id,slug,name,active)
values(pg_temp.qa_id(4),pg_temp.qa_id(2),'staging-phone-qa-20261019','Staging Phone QA',true);
insert into app.fantasy_seasons(id,fantasy_competition_id,football_season_id,ruleset_id,name,status,starts_at,ends_at)
values(pg_temp.qa_id(5),pg_temp.qa_id(4),pg_temp.qa_id(3),'f6100000-0000-4000-8000-000000000100',
 'Staging Phone QA','active',now()-interval '7 days',now()+interval '30 days');
insert into app.fantasy_gameweeks(id,fantasy_season_id,football_round_id,sequence_number,name,deadline_at,starts_at,ends_at,status)
values(pg_temp.qa_id(21),pg_temp.qa_id(5),pg_temp.qa_id(11),1,'Drill GW1',now()-interval '2 days 90 minutes',
 now()-interval '2 days',now()-interval '2 days'+interval '2 hours','provisional'),
 (pg_temp.qa_id(22),pg_temp.qa_id(5),pg_temp.qa_id(12),2,'Drill GW2',now()+interval '2 days'-interval '90 minutes',
 now()+interval '2 days',now()+interval '2 days 2 hours','scheduled');
insert into app.fixtures(id,competition_id,season_id,round_id,home_team_id,away_team_id,kickoff_at,status,home_score,away_score,source_sequence,provider_updated_at,finalized_at)
select pg_temp.qa_id(3000+j),pg_temp.qa_id(2),pg_temp.qa_id(3),pg_temp.qa_id(11),pg_temp.qa_id(100+2*j),pg_temp.qa_id(101+2*j),
 now()-interval '2 days','finished',0,0,1,now()-interval '46 hours',now()-interval '46 hours' from generate_series(0,2) j;
insert into app.fixtures(id,competition_id,season_id,round_id,home_team_id,away_team_id,kickoff_at,status,provider_updated_at)
select pg_temp.qa_id(3010+j),pg_temp.qa_id(2),pg_temp.qa_id(3),pg_temp.qa_id(12),pg_temp.qa_id(100+2*j),pg_temp.qa_id(101+2*j),
 now()+interval '2 days','scheduled',now() from generate_series(0,2) j;
insert into app.fantasy_fixture_assignments(fantasy_season_id,fixture_id,gameweek_id,original_gameweek_id,original_kickoff_at,assigned_kickoff_at,frozen_at,source_version)
select pg_temp.qa_id(5),f.id,pg_temp.qa_id(case when f.round_id=pg_temp.qa_id(11) then 21 else 22 end),
 pg_temp.qa_id(case when f.round_id=pg_temp.qa_id(11) then 21 else 22 end),f.kickoff_at,f.kickoff_at,
 case when f.status='finished' then now()-interval '2 days 90 minutes' end,1
from app.fixtures f where f.season_id=pg_temp.qa_id(3);
insert into app.fantasy_players(id,fantasy_season_id,football_player_id,football_team_id,position_id,price)
select pg_temp.qa_id(2000+i),pg_temp.qa_id(5),pg_temp.qa_id(1000+i),pg_temp.qa_id(100+i/11),pos.id,case when i=1 then 7 else 6 end
from generate_series(0,65) i join app.players p on p.id=pg_temp.qa_id(1000+i)
join app.fantasy_positions pos on pos.code=case p.position when 'goalkeeper' then 'GK' when 'defender' then 'DEF' when 'midfielder' then 'MID' else 'FWD' end;
-- This policy belongs only to the new synthetic fixture; no existing season's
-- activation/recovery path is changed or certified by setting up this fixture.
insert into app_private.fantasy_api_rating_seasons(season_id,from_gameweek,owner_approval)
values(pg_temp.qa_id(5),1,'Owner-requested staging-only real-phone QA fixture; no production data');
insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at)
select 'sofascore','fixture',(996000000+j)::text,pg_temp.qa_id(3000+j),'staging-drill',now() from generate_series(0,2) j;
insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at)
select 'sofascore','player',(996001000+i)::text,pg_temp.qa_id(1000+i),'staging-drill',now() from generate_series(0,65) i;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select api.service_record_fantasy_api_ratings(pg_temp.qa_id(3000+j),(996000000+j)::text,
 (select jsonb_agg(jsonb_build_object('externalId',(996001000+i)::text,'side',case when i<22*j+11 then 'home' else 'away' end,
 'starter',true,'minutes',90,'rating',7.5,'appeared',true,'uncertain',false) order by i)
 from generate_series(22*j,22*j+21) i),statement_timestamp()) from generate_series(0,2) j;
insert into app.fantasy_teams(id,user_id,fantasy_season_id,current_gameweek_id,name,bank,team_value,free_transfers)
select pg_temp.qa_id(10000+n),a.user_id,pg_temp.qa_id(5),pg_temp.qa_id(21),'Phone QA Team '||n,9,91,1
from qa_actors a;
insert into app.fantasy_squad_memberships(id,fantasy_team_id,fantasy_player_id,purchase_price,current_sale_price,acquired_gameweek_id)
select md5('staging-phone-qa-membership-'||n||'-'||i)::uuid,pg_temp.qa_id(10000+n),pg_temp.qa_id(2000+i),case when i=1 then 7 else 6 end,case when i=1 then 7 else 6 end,pg_temp.qa_id(21)
from qa_actors a cross join unnest(array[0,1,12,23,34,5,16,27,38,42,53,11,45,49,64]) i;
insert into app.fantasy_lineups(id,fantasy_team_id,gameweek_id,team_version,locked_at)
select pg_temp.qa_id(20000+n),pg_temp.qa_id(10000+n),pg_temp.qa_id(21),1,now()-interval '2 days 90 minutes' from qa_actors a;
insert into app.fantasy_lineup_players(lineup_id,fantasy_player_id,slot,slot_order,captain,vice_captain,snapshot_price)
select pg_temp.qa_id(20000+n),pg_temp.qa_id(2000+i),case when ord<=11 then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
 case when ord<=11 then ord else ord-11 end,i=5,i=42,case when i=1 then 7 else 6 end
from qa_actors a cross join unnest(array[0,1,12,23,34,5,16,27,38,42,53,11,45,49,64]) with ordinality as chosen(i,ord);
insert into app.fantasy_leagues(id,fantasy_season_id,owner_user_id,name,visibility,member_count,active,invite_code_digest,invite_code_hint)
select pg_temp.qa_id(40000),pg_temp.qa_id(5),(select user_id from qa_actors where n=1),
 'Staging Private Phone QA','private',123,true,
 encode(extensions.digest(convert_to(code,'UTF8'),'sha256'),'hex'),right(code,4) from qa_private_invite;
insert into app.fantasy_league_memberships(id,league_id,fantasy_team_id,user_id,role,status)
select md5('staging-phone-qa-league-'||n)::uuid,pg_temp.qa_id(40000),pg_temp.qa_id(10000+n),a.user_id,
 case when n=1 then 'owner'::app.fantasy_league_role else 'member'::app.fantasy_league_role end,'active'
from qa_actors a;
-- P1: 2,001 distinct, manually authored staging stories, each in both languages.
insert into app.stories(id,origin,original_language)
select pg_temp.qa_id(100000+n),'manual','fr' from generate_series(1,2001) n;
insert into app.article_editions(id,story_id,language,slug,title,summary,body_format,body_source,body_html,
 status,visibility,published_at,reading_time_minutes,sanitizer_version)
select pg_temp.qa_id(110000+2*n+lang),pg_temp.qa_id(100000+n),
 case when lang=0 then 'fr'::app.language_code else 'ar'::app.language_code end,
 'staging-phone-qa-'||n||case when lang=0 then '-fr' else '-ar' end,
 case when lang=0 then 'Test staging : article '||n else 'مقال اختبار رقم '||n end,
 case when lang=0 then 'Texte de test pour vérifier les listes enregistrées.' else 'نص اختبار للتحقق من قائمة المقالات المحفوظة.' end,
 'rich_text',null,
 case when lang=0 then '<p>Contenu de test pour la pagination des articles sur staging.</p>' else '<p>هذا نص اختبار لصفحات الأخبار في بيئة الاختبار.</p>' end,
 'published','public',now()-make_interval(secs=>n),1,'sanitize-html@2.17.5'
from generate_series(1,2001) n cross join generate_series(0,1) lang;
insert into app.saved_articles(user_id,article_edition_id,created_at)
select a.user_id,pg_temp.qa_id(110000+2*article_no+(article_no%2)),now()-make_interval(secs=>article_no)
from qa_actors a cross join lateral generate_series(1,case when a.n=1 then 60 else 2001 end) article_no
where a.n in(1,2);
select jsonb_build_object('season','f9600000-0000-4000-8000-000000000005',
 'teams',(select count(*) from app.fantasy_teams where fantasy_season_id=pg_temp.qa_id(5)),
 'privateLeagueMembers',(select member_count from app.fantasy_leagues where id=pg_temp.qa_id(40000)),
 'savedA',(select count(*) from app.saved_articles where user_id=(select user_id from qa_actors where n=1)),
 'savedB',(select count(*) from app.saved_articles where user_id=(select user_id from qa_actors where n=2)),
 'stories',(select count(*) from app.stories where id::text like 'f9600000-%'),
 'resultsBeforeWorker',(select count(*) from app.fantasy_team_gameweek_results where gameweek_id=pg_temp.qa_id(21)));
commit;
