-- Only after the repaired Edge Function and website are live. Production V2.
-- Check other writers; rehearse rollback and independently verify no change.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select app_private.hold_scheduled_jobs();
lock table app_private.ai_home_story_settings,app_private.ai_home_story_jobs in exclusive mode;
do $guard$
begin
 if (select count(*) from supabase_migrations.schema_migrations)<>171 or (select max(version) from supabase_migrations.schema_migrations)<>'20261009211234' then raise exception 'stop: migration baseline changed'; end if;
 if exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and backend_type='client backend' and state='active' and query !~* '^\s*(select|show)\s') then raise exception 'stop: active writer'; end if;
 if (select count(*) from app_private.ai_home_story_jobs)<>3 or jsonb_array_length(api.home_stories())<>3 then raise exception 'stop: original stories changed'; end if;
 if not exists(select 1 from app_private.ai_home_story_settings where id and not enabled and max_attempts_per_day=6) then raise exception 'stop: not paused at original cap'; end if;
end;
$guard$;
select app_private.ai_home_stories_queue_refresh(array[
 '9d46ae11-4a97-4856-afe8-0c91386c075f'::uuid,
 'c2248295-c928-44f0-86da-ddac8eb6b915'::uuid,
 'ef481b89-c814-4189-80b6-c10f757d5bba'::uuid
]);
select app_private.ai_home_stories_configure(true,6);
select app_private.ai_home_stories_tick();
rollback;
select enabled,(select count(*) from app_private.ai_home_story_jobs where status='superseded') queued from app_private.ai_home_story_settings;
