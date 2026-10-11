-- Owner-authorized, bounded maintenance on tkewgajrljbwgwedqsxn, 2026-10-11.
-- Check GitHub production workflows and completed Edge responses first.
-- Rehearse, independently verify rollback, then replace rollback with commit.
-- Restore with sofascore-held-maintenance-resume.sql immediately after writes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select app_private.hold_scheduled_jobs();
do $maintenance$
declare j record;
begin
  if (select count(*) from cron.job) <> 21 or exists(select 1 from cron.job where not active)
    or not exists(select 1 from app_private.notification_email_settings where id and mode='off' and football_live_refresh_enabled)
    or not exists(select 1 from app_private.fantasy_automation_settings where id and lifecycle_tick_enabled)
    or not exists(select 1 from app_private.manager_card_settings where id and compute_enabled and read_enabled)
    or not exists(select 1 from app_private.pepites_settings where id and mode='public' and not auto_publish)
    or not exists(select 1 from app_private.account_deletion_settings where id and enabled)
    or not exists(select 1 from app_private.prediction_settings where id and mode='public' and scoring_enabled)
    or not exists(select 1 from app_private.ai_home_story_settings where id and enabled and max_attempts_per_day=6)
    or not exists(select 1 from app_private.ai_content_settings where id and enabled and max_articles_per_day=3)
  then raise exception 'stop: maintenance baseline changed'; end if;
  if exists(select 1 from net.http_request_queue)
    or exists(select 1 from app_private.ai_home_story_jobs where status='generating')
    or exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and backend_type='client backend' and state='active')
  then raise exception 'stop: another worker has not drained'; end if;
  perform app_private.notification_email_configure('off',null,null,false);
  perform app_private.fantasy_automation_configure(false);
  perform app_private.manager_card_configure(false,null);
  perform app_private.pepites_configure('off',null);
  perform app_private.account_deletion_configure(false);
  perform app_private.predictions_configure('public',false);
  perform app_private.ai_home_stories_configure(false);
  perform app_private.ai_content_configure(false);
  for j in select jobid from cron.job loop
    perform cron.alter_job(j.jobid,active:=false);
  end loop;
  if exists(select 1 from cron.job where active) then raise exception 'stop: cron pause failed'; end if;
end;
$maintenance$;
rollback;
