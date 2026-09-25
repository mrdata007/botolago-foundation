-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply a reviewed plan for this season's player list (migration
-- 20260925200000, docs/backend/CURRENT_PLAYER_LIST_UPDATE.md): players move to
-- the club SportsMonks shows them at, new players join the list and the game,
-- hand-typed players get their SportsMonks id, and a hand-typed double nobody
-- has used leaves both. Fantasy teams keep every player they hold; no price
-- changes.
--
-- WHEN
--   After GitHub -> Actions -> "Observe current Football player list" has run
--   and its plan (the evidence file current-player-list.json) has been
--   reviewed, within 24 hours of that run, and not during a match.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Check that nothing else is writing, and wait for anything
--      that is (AGENTS.md, "Before writing"), before the rehearsal and again
--      before the real run:
--        * GitHub -> Actions: no run in progress;
--        * pg_cron: nothing mid-run. This should return no rows (the script
--          checks it again itself, and stops if not):
--            select job.jobname, run.status, run.start_time
--            from cron.job_run_details run join cron.job job using (jobid)
--            where run.status not in ('succeeded', 'failed')
--              and run.start_time > now() - interval '15 minutes';
--        * no other query running (Database -> Query performance).
--   2. This changes the Fantasy player list, so pause the Fantasy lifecycle
--      tick first (the script refuses while it is on):
--        select app_private.fantasy_automation_configure(false);
--   3. Below, replace PASTE-OBSERVATION-ID with the plan's "observationId" and
--      PASTE-PLAN-DIGEST with its "digest".
--   4. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL:
--      the plan is applied inside one transaction, checked, and then ROLLED
--      BACK. The result row shows the plan's summary and says "Not applied".
--   5. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   6. Whatever the result, switch the tick back on:
--        select app_private.fantasy_automation_configure(true);
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. A plan whose digest no longer matches has changed since
--   it was reviewed: observe again and review the new plan. Do not edit a
--   check to make it pass.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create temp table player_list_request on commit drop as
select 'PASTE-OBSERVATION-ID'::text as observation_id, 'PASTE-PLAN-DIGEST'::text as plan_digest;

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  request record;
begin
  select * into request from player_list_request;
  if request.observation_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or request.plan_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'stop: fill in the plan''s observationId and digest first (step 3)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260925200000') then
    raise exception 'stop: migration 20260925200000 is not applied';
  end if;
  if not exists (select 1 from app_private.current_player_list_observations
    where id = request.observation_id::uuid) then
    raise exception 'stop: no observation %', request.observation_id;
  end if;

  -- AGENTS.md: nothing else writes the Fantasy catalog while this runs.
  if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
    raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false); and switch it back on afterwards';
  end if;

  -- AGENTS.md: serialise with the scheduled jobs. The step 1 check, made
  -- again here at the moment of writing: a job mid-run means waiting for it.
  if exists (select 1 from cron.job_run_details run
    where run.status not in ('succeeded', 'failed')
      and run.start_time > statement_timestamp() - interval '15 minutes') then
    raise exception 'stop: a scheduled (pg_cron) job is running right now -- nothing was saved; run this again in a minute';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Apply, as the service role the function is written for
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api.service_apply_current_player_list(observation_id::uuid, plan_digest)
from player_list_request;

-- ---------------------------------------------------------------------------
-- Postflight: the update is recorded and the observation plans nothing more
-- ---------------------------------------------------------------------------
do $postflight$
declare
  request record;
begin
  select * into request from player_list_request;
  if not exists (select 1 from app_private.current_player_list_updates
    where observation_id = request.observation_id::uuid and plan_digest = request.plan_digest) then
    raise exception 'stop: the update was not recorded';
  end if;
  if (app_private.current_player_list_plan(request.observation_id::uuid) #>> '{summary,changes}')::integer <> 0 then
    raise exception 'stop: the observation still plans changes after the update';
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select observation.id as observation_id,
  case when applied.id is not null
    then 'Applied. ' || applied.result::text || ' Switch the Fantasy tick back on.'
    else 'Not applied (a rehearsal saves nothing). Plan: '
      || (app_private.current_player_list_plan(observation.id) -> 'summary')::text
      || ' Change rollback; to commit; and run again. Then switch the Fantasy tick back on.'
  end as result
from app_private.current_player_list_observations observation
left join app_private.current_player_list_updates applied on applied.observation_id = observation.id
order by observation.observed_at desc
limit 1;
