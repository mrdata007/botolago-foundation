-- Restore exactly the baseline checked by sofascore-held-maintenance-pause.sql.
-- Rehearse, independently verify rollback, then replace rollback with commit.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select app_private.hold_scheduled_jobs();
do $maintenance$
declare j record;
begin
  if (select count(*) from cron.job) <> 21 or exists(select 1 from cron.job where active)
    or not exists(select 1 from app_private.notification_email_settings where id and mode='off' and not football_live_refresh_enabled)
    or not exists(select 1 from app_private.fantasy_automation_settings where id and not lifecycle_tick_enabled)
    or not exists(select 1 from app_private.manager_card_settings where id and not compute_enabled and read_enabled)
    or not exists(select 1 from app_private.pepites_settings where id and mode='off' and not auto_publish)
    or not exists(select 1 from app_private.account_deletion_settings where id and not enabled)
    or not exists(select 1 from app_private.prediction_settings where id and mode='public' and not scoring_enabled)
    or not exists(select 1 from app_private.ai_home_story_settings where id and not enabled and max_attempts_per_day=6)
    or not exists(select 1 from app_private.ai_content_settings where id and not enabled and max_articles_per_day=3)
  then raise exception 'stop: paused maintenance baseline changed'; end if;
  if exists(select 1 from net.http_request_queue)
    or exists(select 1 from app_private.ai_home_story_jobs where status='generating')
    or exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and backend_type='client backend' and state='active')
  then raise exception 'stop: another worker has not drained'; end if;
  perform app_private.notification_email_configure('off',null,null,true);
  perform app_private.fantasy_automation_configure(true);
  perform app_private.manager_card_configure(true,null);
  perform app_private.pepites_configure('public',null);
  perform app_private.account_deletion_configure(true);
  perform app_private.predictions_configure('public',true);
  perform app_private.ai_home_stories_configure(true,6);
  perform app_private.ai_content_configure(true,null,3);
  for j in select jobid from cron.job loop
    perform cron.alter_job(j.jobid,active:=true);
  end loop;
  if exists(select 1 from cron.job where not active) then raise exception 'stop: cron resume failed'; end if;
end;
$maintenance$;
rollback;
