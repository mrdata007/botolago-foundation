-- First activation only. Check production writers and Edge deployment first.
-- Rehearse with rollback, independently re-read, then replace only rollback with commit.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select app_private.hold_scheduled_jobs();
lock table app_private.ai_home_story_settings,app_private.ai_home_story_jobs in exclusive mode;
do $guard$
begin
  if (select count(*) from supabase_migrations.schema_migrations)<>170
    or not exists(select 1 from supabase_migrations.schema_migrations where version='20261009195943')
    then raise exception 'stop: migration baseline changed'; end if;
  if not exists(select 1 from app_private.ai_home_story_settings where id and not enabled and max_attempts_per_day=6)
    or exists(select 1 from app_private.ai_home_story_jobs) then raise exception 'stop: not a fresh paused install'; end if;
  if exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and backend_type='client backend' and state='active' and query !~* '^\s*(select|show)\s') then raise exception 'stop: active writer'; end if;
  if not exists(select 1 from cron.job where jobname='ai-home-stories' and active and schedule='4,14,24,34,44,54 * * * *') then raise exception 'stop: schedule changed'; end if;
  if not exists(select 1 from app_private.notification_email_settings where id and functions_base_url='https://tkewgajrljbwgwedqsxn.supabase.co/functions/v1') then raise exception 'stop: wrong Edge target'; end if;
end;
$guard$;
select app_private.ai_home_stories_configure(true,6);
-- pg_net dispatches only after commit, so rehearsal cannot call the provider.
select app_private.ai_home_stories_tick() as request_id;
rollback;
select enabled,max_attempts_per_day from app_private.ai_home_story_settings;
