-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Apply migration 20260925090500_fantasy_league_page_skip_empty: Pronostics
-- (BG-0146), part 6 of 6. The Fantasy scoring worker stops walking leagues
-- that have no Fantasy member (a league created from Pronostics starts with
-- none), so they cannot use up its call budget.
--
-- WHEN
--   Only after Fantasy gameweek 1 has been locked and scored in production,
--   and after apply-20260925090000-predictions.sql. The script checks both.
--   Not at minute 12 of an hour (the Fantasy orchestrator), and not while a
--   Fantasy scoring run is going on.
--
-- HOW TO RUN
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor ->
--      New query. Make sure no other database work is running right now.
--   2. Pause the Fantasy lifecycle tick, as AGENTS.md asks before a write that
--      touches Fantasy (this script refuses while it is on):
--        select app_private.fantasy_automation_configure(false);
--   3. Paste this WHOLE file and press Run.
--      As shipped it is a REHEARSAL: everything is applied inside one
--      transaction, checked, and then ROLLED BACK. The result row should say
--      "Rehearsal passed".
--   4. Change the line `rollback;` near the bottom to `commit;` and press Run
--      again. The result row should say "Applied".
--   5. Whatever the result, switch the tick back on (if it was on at step 2):
--        select app_private.fantasy_automation_configure(true);
--   If any check fails, the script stops with a message saying what, and
--   nothing is saved. Do not edit a check to make it pass: a check firing means
--   the database is not in the state this script expects.
--
-- WHAT IT DOES
--   * refuses to run twice, before Pronostics parts 1 to 5, before Fantasy
--     gameweek 1 is scored, while the Fantasy lifecycle tick is on, or where
--     api.service_fantasy_scoring_league_page is not the version this replaces
--     (20260914200719, byte for byte as production held it on 2026-09-24);
--   * records the migration file in supabase_migrations.schema_migrations,
--     whole as statements[1], and runs it from that record once its sha256
--     matches the repository file;
--   * checks the result: the new version is in place, only the service role
--     may call it, and one real call answers.
--   Same signature, same answer shape, same grants: the worker needs no
--   change. A league that gains its first Fantasy member is listed again from
--   the next run.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260925090500') then
    raise exception 'stop: migration 20260925090500 is already recorded as applied';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260925090400') then
    raise exception 'stop: Pronostics parts 1 to 5 are not applied yet -- run apply-20260925090000-predictions.sql first';
  end if;
  if to_regprocedure('api.service_fantasy_scoring_league_page(uuid, uuid, integer)') is null
    or to_regprocedure('app_private.is_service_request()') is null
    or to_regclass('app.fantasy_gameweeks') is null
    or to_regclass('app.fantasy_leagues') is null
    or to_regclass('app.fantasy_league_memberships') is null then
    raise exception 'stop: the database is missing the Fantasy scoring worker this update changes';
  end if;

  -- The rule this migration was written under: not before gameweek 1 is scored.
  if not exists (
    select 1 from app.fantasy_gameweeks
    where sequence_number = 1 and finalized_at is not null and points_state = 'final'
  ) then
    raise exception 'stop: Fantasy gameweek 1 has not been scored yet -- wait until it is finalized';
  end if;

  -- AGENTS.md: a write that touches Fantasy runs with the Fantasy lifecycle
  -- tick paused. Parts 1 to 5 went in with it running
  -- (docs/production/APPLIED_2026_09_25_PREDICTIONS.md); this part does not.
  if to_regclass('app_private.fantasy_automation_settings') is not null then
    if exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled) then
      raise exception 'stop: the Fantasy lifecycle tick is on -- pause it first with select app_private.fantasy_automation_configure(false); and switch it back on afterwards';
    end if;
  end if;

  if md5(pg_get_functiondef(
    'api.service_fantasy_scoring_league_page(uuid, uuid, integer)'::regprocedure
  )) <> '021d0a3422cf68d4c213b028974888d2' then
    raise exception 'stop: api.service_fantasy_scoring_league_page is not the version this update replaces (20260914200719)';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Migration 20260925090500, exactly as in the repository, into the history
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260925090500',
  'fantasy_league_page_skip_empty',
  array[$bg_20260925090500_file$-- BotolaGO Production V2
-- Pronostics (score predictions), part 6 of 6: Fantasy skips leagues without
-- Fantasy members.
--
-- A league is shared by the two games ("one league, two games"): the row lives
-- in app.fantasy_leagues, Fantasy managers are in app.fantasy_league_memberships
-- and Pronostics-only players are in app.prediction_league_members. A league
-- created from Pronostics starts with no Fantasy member at all.
--
-- The Fantasy finalization worker (scripts/backend/fantasy-lifecycle-runner.ts)
-- walks every active league of the season through this page and makes two
-- ranking calls per league, inside a fixed call budget (maxBatches, default
-- 5000). Ranking a league without Fantasy members writes nothing, so those
-- calls are pure cost, and enough of them would end Fantasy finalization with
-- fantasy_worker_batch_limit. The page now lists only leagues with at least one
-- active Fantasy membership, in both the page and the hasMore probe, so the
-- cursor stays consistent.
--
-- Nothing else changes: same signature, same payload, same grants. A league
-- that gains its first Fantasy member is listed again from the next run.
--
-- Apply only after Fantasy gameweek 1 has been locked and scored in production.
--
-- Plan: docs/backend/PREDICTIONS_DOMAIN_PLAN.md (BG-0146).

create or replace function api.service_fantasy_scoring_league_page(p_gameweek_id uuid,p_after_league_id uuid default null,p_batch_size integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare season_id uuid; ids jsonb; last_id uuid;
begin
  if not app_private.is_service_request() then raise exception using errcode='PT403',message='forbidden'; end if;
  if p_gameweek_id is null or p_batch_size is null or p_batch_size not between 1 and 100 then raise exception using errcode='PT400',message='validation_failed'; end if;
  select fantasy_season_id into season_id from app.fantasy_gameweeks where id=p_gameweek_id;
  if not found then raise exception using errcode='PT404',message='fantasy_gameweek_not_found'; end if;
  select coalesce(jsonb_agg(id order by id),'[]'::jsonb),(array_agg(id order by id desc))[1] into ids,last_id
    from (select league.id from app.fantasy_leagues league
      where league.fantasy_season_id=season_id and league.active
        and (p_after_league_id is null or league.id>p_after_league_id)
        and exists(select 1 from app.fantasy_league_memberships membership
          where membership.league_id=league.id and membership.status='active')
      order by league.id limit p_batch_size) page;
  return jsonb_build_object('leagueIds',ids,'afterLeagueId',last_id,'hasMore',exists(
    select 1 from app.fantasy_leagues league
    where league.fantasy_season_id=season_id and league.active and league.id>last_id
      and exists(select 1 from app.fantasy_league_memberships membership
        where membership.league_id=league.id and membership.status='active')));
end;
$$;
revoke all on function api.service_fantasy_scoring_league_page(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function api.service_fantasy_scoring_league_page(uuid,uuid,integer) to service_role;
$bg_20260925090500_file$]
);

-- ---------------------------------------------------------------------------
-- Run them from the history, in order, once each is the repository file byte
-- for byte
-- ---------------------------------------------------------------------------
do $apply$
declare
  part_20260925090500 text := (
    select statements[1] from supabase_migrations.schema_migrations where version = '20260925090500'
  );
begin
  if encode(sha256(convert_to(part_20260925090500, 'UTF8')), 'hex')
    is distinct from '5f48dc1dde7e1d95a2f81f804828a913772a69fe03f0ca3c1c1ceb1ed7634846' then
    raise exception 'stop: 20260925090500 is not the repository file byte for byte -- was this script cut short or changed?';
  end if;

  execute part_20260925090500;
end
$apply$;

-- ---------------------------------------------------------------------------
-- Postflight: check the result
-- ---------------------------------------------------------------------------
do $postflight$
declare
  problems text[] := '{}';
  signature constant regprocedure :=
    'api.service_fantasy_scoring_league_page(uuid, uuid, integer)'::regprocedure;
  gameweek uuid;
  page jsonb;
  expected integer;
begin
  if md5(pg_get_functiondef(signature)) <> '7f79f52c973b0cf888ee8c6c2b927573' then
    problems := problems || 'the league page is not the new version'::text;
  end if;
  if has_function_privilege('anon', signature, 'execute')
    or has_function_privilege('authenticated', signature, 'execute')
    or not has_function_privilege('service_role', signature, 'execute') then
    problems := problems || 'the league page is callable by the wrong roles'::text;
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260925090500') then
    problems := problems || 'history row missing'::text;
  end if;

  -- One real call, as the worker makes it: the first page of gameweek 1 lists
  -- exactly the active leagues of its season that have a Fantasy member (up to
  -- the page size).
  select id into gameweek from app.fantasy_gameweeks where sequence_number = 1 and finalized_at is not null
  order by finalized_at desc limit 1;
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  page := api.service_fantasy_scoring_league_page(gameweek, null, 100);
  perform set_config('request.jwt.claims', '', true);
  select least(count(*), 100) into expected
  from app.fantasy_leagues league
  where league.fantasy_season_id = (select fantasy_season_id from app.fantasy_gameweeks where id = gameweek)
    and league.active
    and exists (
      select 1 from app.fantasy_league_memberships membership
      where membership.league_id = league.id and membership.status = 'active'
    );
  if jsonb_array_length(page -> 'leagueIds') <> expected then
    problems := problems || ('the page lists ' || jsonb_array_length(page -> 'leagueIds') || ' leagues, expected ' || expected);
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: the update did not check out: %', problems;
  end if;
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. To apply for real, change the next line to:
--   commit;
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from supabase_migrations.schema_migrations where version = '20260925090500')
    then 'Applied. The Fantasy scoring worker now skips leagues without Fantasy members.'
  else 'Rehearsal passed. Nothing was saved. Change rollback; to commit; and run again.'
end as result;
