-- STAGING srdrflfrfpwixsllveid first; PRODUCTION tkewgajrljbwgwedqsxn only.
-- Canonical migration 20261019111026; SHA256 5ff783a9a6acdd8c4112d2b8b953a0af962fdeaea87beb4e7088dc28fe361a3f.
-- Reviewed exact main SHA, one operator, no competing workflow/schema writer.
-- Enum and automation are SEPARATE committed transactions. Never combine them.
-- This script never enables email or sends a message. Rehearse first, then
-- independently verify rollback. Change only bg.manager_email_mode to apply.
-- Before stage 1: record/pause relevant cron and worker switches, drain Edge
-- leases/requests, and restore the recorded switches promptly after completion.
begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
select set_config('bg.manager_email_mode','rehearsal',true);
select app_private.hold_scheduled_jobs();
do $preflight$
begin
 if not exists(select 1 from app.fantasy_seasons where id in('5ada3e98-2929-405a-a3f1-a26de8e51933','f9700000-0000-4000-8000-000000000005'))then
  raise exception 'manager_email_target_season_missing';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261019111026')then raise exception 'manager_email_already_applied';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261018215311')then raise exception 'manager_email_rating_publication_required';end if;
 if not exists(select 1 from app_private.notification_email_settings where id and mode='off')then raise exception 'manager_email_sending_must_be_off';end if;
 if exists(select 1 from pg_enum where enumtypid='app.notification_type'::regtype and enumlabel='gameweek_opened')then raise exception 'manager_email_enum_already_present';end if;
end $preflight$;
create temporary table manager_email_before on commit drop as select 'events' name,md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,'')) digest from app_private.notification_events t
union all select 'notifications',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.notifications t
union all select 'deliveries',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.notification_deliveries t
union all select 'gameweeks',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.fantasy_gameweeks t
union all select 'results',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.fantasy_team_gameweek_results t
union all select 'preferences',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.user_id)::text,''))from app.user_preferences t
union all select 'settings',md5(coalesce(jsonb_agg(to_jsonb(t)-'manager_automation_enabled'-'enabled_types')::text,''))from app_private.notification_email_settings t
union all select 'cron',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.jobid)::text,''))from cron.job t;
insert into supabase_migrations.schema_migrations(version,name,statements)
values('20261019111026','fantasy_manager_email_event_type',array[$manager_email_20261019111026$-- PostgreSQL requires the new value to commit before it is used in templates.
alter type app.notification_type add value if not exists 'gameweek_opened';
$manager_email_20261019111026$]);
do $install$
declare source text;
begin
 select statements[1]into source from supabase_migrations.schema_migrations where version='20261019111026';
 if encode(extensions.digest(source,'sha256'),'hex')<>'5ff783a9a6acdd8c4112d2b8b953a0af962fdeaea87beb4e7088dc28fe361a3f'then raise exception 'manager_email_source_checksum_mismatch';end if;
 execute source;
end $install$;
do $postflight$
begin
 if exists(select 1 from manager_email_before b full join(select 'events' name,md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,'')) digest from app_private.notification_events t
union all select 'notifications',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.notifications t
union all select 'deliveries',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.notification_deliveries t
union all select 'gameweeks',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.fantasy_gameweeks t
union all select 'results',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.id)::text,''))from app.fantasy_team_gameweek_results t
union all select 'preferences',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.user_id)::text,''))from app.user_preferences t
union all select 'settings',md5(coalesce(jsonb_agg(to_jsonb(t)-'manager_automation_enabled'-'enabled_types')::text,''))from app_private.notification_email_settings t
union all select 'cron',md5(coalesce(jsonb_agg(to_jsonb(t)order by t.jobid)::text,''))from cron.job t)a using(name)where b.digest is distinct from a.digest)then raise exception 'manager_email_unexpected_data_change';end if;
 if not exists(select 1 from pg_enum where enumtypid='app.notification_type'::regtype and enumlabel='gameweek_opened')then raise exception 'manager_email_enum_missing';end if;
 if current_setting('bg.manager_email_mode')='rehearsal'then raise exception 'MANAGER_EMAIL_REHEARSAL_PASSED_20261019111026: all changes rolled back';end if;
 if current_setting('bg.manager_email_mode')<>'apply'then raise exception 'manager_email_invalid_promotion_mode';end if;
end $postflight$;
commit;
select version,name from supabase_migrations.schema_migrations where version='20261019111026';
