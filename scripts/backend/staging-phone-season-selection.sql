-- Temporarily hide exactly two old synthetic seasons from default Fantasy reads.
-- STAGING ONLY. Run in an exclusive, fully paused writer window. Rehearse with
-- ROLLBACK before applying. The private Vault snapshot survives interruption.
-- Set botolago.phone_selection_action to park or restore. A successful phone
-- fixture must be retired before restore; no team, score or date is rewritten.
begin;
set local lock_timeout='10s';
set local statement_timeout='120s';
do $$ begin
 if current_setting('botolago.release_drill',true) is distinct from 'srdrflfrfpwixsllveid'
 or current_setting('botolago.phone_selection_action',true) not in ('park','restore')
 or current_setting('botolago.phone_selection_action',true) is null then
   raise exception 'staging_phone_selection_target_refused'; end if;
 if exists(select 1 from cron.job where active)
 or exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>now())
 or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
 or exists(select 1 from app_private.notification_email_settings where mode<>'off' or football_live_refresh_enabled)
 or exists(select 1 from app_private.notification_push_settings where mode<>'off')
 or exists(select 1 from app_private.rivals_settings where enabled)
 or exists(select 1 from app_private.ops_alert_state where enabled)
 or exists(select 1 from app_private.ai_content_settings where enabled)
 or exists(select 1 from app_private.ai_home_story_settings where enabled)
 or exists(select 1 from app_private.ai_home_story_jobs where status='generating')
 or exists(select 1 from app.notification_deliveries where status='claimed')
 or exists(select 1 from app.account_deletion_requests where status='processing')
 or exists(select 1 from app_private.account_deletion_settings where enabled)
 or exists(select 1 from app_private.manager_card_settings where compute_enabled)
 or exists(select 1 from app_private.trophy_settings where enabled)
 or exists(select 1 from app_private.pepites_settings where mode<>'off')
 or exists(select 1 from app_private.prediction_settings where mode<>'off')
 or exists(select 1 from pg_stat_activity where backend_type='client backend'
   and pid<>pg_backend_pid() and state<>'idle') then
   raise exception 'staging_phone_selection_writers_not_idle'; end if;
end $$;

create temporary table phone_legacy_seasons(id uuid primary key, name text, status app.fantasy_season_status,
 starts_at timestamptz, ends_at timestamptz) on commit drop;
insert into phone_legacy_seasons values
 ('1a0c2026-1018-4000-8000-000000000004','Launch QA 2026-10-18','registration_open','2091-08-01Z','2092-06-30Z'),
 ('fa630000-0000-4000-8000-000000000001','2089/90 Capacity','active','2089-08-01Z','2090-06-30Z');

-- Full business metadata is retained, including the original status. Audit
-- updated_at changes normally through its trigger and is intentionally omitted.
create function pg_temp.phone_selection_metadata() returns jsonb language sql as $$
 select jsonb_agg(to_jsonb(s)-'updated_at' order by s.id)
 from app.fantasy_seasons s join phone_legacy_seasons expected using(id);
$$;
create function pg_temp.phone_selection_content() returns jsonb language sql as $$
 select jsonb_build_object(
 'teams', (select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by t.id),'')) from app.fantasy_teams t
   where t.fantasy_season_id in(select id from phone_legacy_seasons)),
 'gameweeks', (select md5(coalesce(string_agg(to_jsonb(g)::text,'' order by g.id),'')) from app.fantasy_gameweeks g
   where g.fantasy_season_id in(select id from phone_legacy_seasons)),
 'results', (select md5(coalesce(string_agg(to_jsonb(r)::text,'' order by r.id),'')) from app.fantasy_team_gameweek_results r
   join app.fantasy_gameweeks g on g.id=r.gameweek_id where g.fantasy_season_id in(select id from phone_legacy_seasons)));
$$;

do $$ declare saved jsonb; original jsonb; content jsonb; chosen uuid; action text:=current_setting('botolago.phone_selection_action');
begin
 perform pg_advisory_xact_lock(hashtextextended('staging-phone-season-selection',0));
 if (select count(*) from app.fantasy_seasons s join phone_legacy_seasons e using(id)
   where s.name=e.name and s.starts_at=e.starts_at and s.ends_at=e.ends_at)<>2 then
   raise exception 'staging_phone_selection_legacy_identity_changed'; end if;
 select decrypted_secret::jsonb into saved from vault.decrypted_secrets
 where name='botolago_staging_phone_season_selection';
 if action='park' then
   if saved is not null then raise exception 'staging_phone_selection_already_parked'; end if;
   if exists(select 1 from app.fantasy_seasons s join phone_legacy_seasons e using(id) where s.status<>e.status) then
     raise exception 'staging_phone_selection_unreviewed_status'; end if;
   select id into chosen from app.fantasy_seasons
   where status in ('registration_open','active') and id not in(select id from phone_legacy_seasons)
   order by starts_at desc limit 1;
   if chosen is null or chosen not in ('f9700000-0000-4000-8000-000000000005'::uuid,
     'f9600000-0000-4000-8000-000000000005'::uuid) then
     raise exception 'staging_phone_selection_target_missing'; end if;
   original:=pg_temp.phone_selection_metadata(); content:=pg_temp.phone_selection_content();
   perform vault.create_secret(jsonb_build_object('before',original,'content',content)::text,
     'botolago_staging_phone_season_selection','Temporary staging QA default-season selection; restore after phone retirement',null);
   update app.fantasy_seasons set status='planned' where id in(select id from phone_legacy_seasons);
   if (api.fantasy_hub('fr')->'season'->>'id')::uuid is distinct from chosen
   or (api.fantasy_hub('ar')->'season'->>'id')::uuid is distinct from chosen then
     raise exception 'staging_phone_selection_default_api_mismatch'; end if;
   if pg_temp.phone_selection_metadata() is distinct from
     (select jsonb_agg(value||'{"status":"planned"}'::jsonb order by value->>'id') from jsonb_array_elements(original))
   or pg_temp.phone_selection_content() is distinct from content then
     raise exception 'staging_phone_selection_content_changed'; end if;
 else
   if saved is null then raise exception 'staging_phone_selection_restore_context_missing'; end if;
   if exists(select 1 from app.fantasy_seasons where id in('f9700000-0000-4000-8000-000000000005',
     'f9600000-0000-4000-8000-000000000005') and status in ('active','registration_open')) then
     raise exception 'staging_phone_selection_retire_fixture_first'; end if;
   if pg_temp.phone_selection_metadata() is distinct from
     (select jsonb_agg(value||'{"status":"planned"}'::jsonb order by value->>'id') from jsonb_array_elements(saved->'before'))
   or pg_temp.phone_selection_content() is distinct from saved->'content' then
     raise exception 'staging_phone_selection_restore_drift'; end if;
   update app.fantasy_seasons s set status=e.status from phone_legacy_seasons e where s.id=e.id;
   if pg_temp.phone_selection_metadata() is distinct from saved->'before'
   or pg_temp.phone_selection_content() is distinct from saved->'content' then
     raise exception 'staging_phone_selection_restore_failed'; end if;
   delete from vault.secrets where name='botolago_staging_phone_season_selection';
 end if;
end $$;
drop function pg_temp.phone_selection_metadata();
drop function pg_temp.phone_selection_content();
drop table phone_legacy_seasons;
select jsonb_build_object('stagingOnly',true,'action',current_setting('botolago.phone_selection_action'),'verified',true);
commit;
