-- Manager Card (BG-0158), part 5: the two scheduled jobs.
--
-- Both are scheduled but do nothing until the owner switches compute on and
-- inserts an active ruleset: manager_card_tick() answers `off` / `no_rules`
-- without writing. cron.schedule with a name replaces a job of that name, so
-- this file can be applied again.
--
-- manager-card-tick runs every 15 minutes with its own statement timeout (10 minutes: a gameweek is never split, and the calculation reads every week of the season so far).
-- manager-card-history-prune runs daily at 03:47 UTC, whatever the switch says:
-- it deletes only this tick's cron.job_run_details rows older than 7 days and
-- the job-log rows older than 180 days. It never touches app.* card tables.

select cron.schedule(
  'manager-card-tick',
  '*/15 * * * *',
  $job$set local statement_timeout = '10min'; select app_private.manager_card_tick();$job$
);

select cron.schedule(
  'manager-card-history-prune',
  '47 3 * * *',
  $prune$
    delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'manager-card-tick')
      and end_time < now() - interval '7 days';
    delete from app_private.manager_card_job_log
    where started_at < now() - interval '180 days';
  $prune$
);
