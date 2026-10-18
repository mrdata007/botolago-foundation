-- Switch on the Fantasy rating rule from gameweek 5 of the 2026/27 season
-- (owner decision of 2026-10-13, docs/backend/FANTASY_RATING_POINTS.md).
--
-- From GW5: a player's points for a match are his SofaScore rating rounded to the
-- nearest whole number (halves up), pending when he appeared without a rating, 0 when he
-- did not appear. Captain, vice-captain, chips, automatic substitutions and transfer
-- hits are unchanged. GW1-4 and every result already saved stay exactly as they are.
--
-- Owner-run, on production (tkewgajrljbwgwedqsxn), AFTER migrations 20261014090000
-- and 20261014090100 are applied and the Edge Functions `fantasy-lifecycle-worker`
-- and `football-live-refresh` run this branch's code (the worker must know ruleset
-- 3.0 before a GW5 snapshot exists, and the observations must carry the rating).
-- Run it while GW5 is still scheduled or open, that is before the GW5 deadline.
--
-- 1. Rehearse: run this file as it is. It ends in ROLLBACK and changes nothing.
--    Read the result sets: the switch, the gameweeks it covers, what the rules page
--    will say. Any guard that fails stops with "stop: ..." and changes nothing.
-- 2. Re-read independently that nothing changed:
--      select count(*) from app_private.fantasy_rating_policy;   -- 0
-- 3. Change only the final `rollback;` to `commit;` and run it once.
-- 4. Re-read: select * from app_private.fantasy_rating_policy;
--
-- What it writes: one row of app_private.fantasy_rating_policy. Nothing else. It
-- reads (and locks, for the length of the transaction) the season's gameweeks, so a
-- gameweek cannot change status while it decides. No background job needs pausing:
-- no job writes the policy table, and the documents of GW1-4 are compared before and
-- after the switch inside this transaction (the script stops if any moved).
--
-- To undo before GW5 finalizes (emergency only; GW5 is then rescored under the
-- category rule on the next pass):
--   select app_private.fantasy_rating_points_configure('5ada3e98-2929-405a-a3f1-a26de8e51933', false, 5);
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $guard$
declare
  s constant uuid := '5ada3e98-2929-405a-a3f1-a26de8e51933';
  gw5 text;
begin
  if (select count(*) from supabase_migrations.schema_migrations
       where version in ('20261014090000', '20261014090100')) <> 2 then
    raise exception 'stop: migrations 20261014090000 and 20261014090100 are not both applied';
  end if;
  if not exists(select 1 from supabase_migrations.schema_migrations where version='20261018153305') then
    raise exception 'stop: actual API rating requirement migration 20261018153305 is not applied';
  end if;
  -- The reviewed bodies (md5 of pg_proc.prosrc, recomputed from the migration files by
  -- scripts/backend/activate-fantasy-rating-points-script.test.ts).
  if md5((select prosrc from pg_proc where oid = 'app_private.fantasy_rating_points_configure(uuid,boolean,integer)'::regprocedure))
       is distinct from 'c010fb78c663e35599b176992a1985cd'
    or md5((select prosrc from pg_proc where oid = 'app_private.fantasy_scoring_input_document(uuid)'::regprocedure))
       is distinct from 'afadd0ff2962af449192608e22aaf507'
    or md5((select prosrc from pg_proc where oid = 'api.fantasy_rules(uuid)'::regprocedure))
       is distinct from '0b4e4f27ac3f510d968b21a8485aa9ae'
    or md5((select prosrc from pg_proc where oid = 'api.service_persist_fantasy_scoring_results(uuid,bigint,text,jsonb,jsonb)'::regprocedure))
       is distinct from '9722dc37a65013040a350383b08a478d' then
    raise exception 'stop: a function of the rating rule is not the reviewed body';
  end if;
  if not exists (select 1 from app.fantasy_rulesets where id = 'f6200000-0000-4000-8000-000000000300'
                  and version = 3 and minor_version = 0 and ruleset_code = 'botolago-fantasy-v3.0') then
    raise exception 'stop: ruleset v3.0 is missing';
  end if;
  if not exists (select 1 from app.fantasy_seasons where id = s) then
    raise exception 'stop: the 2026/27 Fantasy season is not there';
  end if;
  if not exists (select 1 from app_private.fantasy_adaptive_policy
                  where season_id = s and not paused and from_gameweek <= 5) then
    raise exception 'stop: adaptive scoring is not on for the season from GW5 or earlier (the rating comes from its observations)';
  end if;
  if exists (select 1 from app_private.fantasy_rating_policy where season_id = s) then
    raise exception 'stop: the season already has a rating policy row; read it before doing anything';
  end if;
  select status::text into gw5 from app.fantasy_gameweeks where fantasy_season_id = s and sequence_number = 5;
  if gw5 is null then raise exception 'stop: GW5 does not exist'; end if;
  if gw5 not in ('scheduled', 'open') then
    raise exception 'stop: GW5 is %, the rule can start only at a scheduled or open gameweek', gw5;
  end if;
  if exists (select 1 from app.fantasy_gameweeks where fantasy_season_id = s and sequence_number > 5
              and status not in ('scheduled', 'open')) then
    raise exception 'stop: a gameweek after GW5 has already started';
  end if;
end;
$guard$;

-- Baseline: the scoring document of every gameweek before GW5.
create temporary table rating_points_baseline on commit drop as
select g.id, g.sequence_number,
       encode(extensions.digest(app_private.fantasy_scoring_input_document(g.id)::text, 'sha256'), 'hex') as digest
  from app.fantasy_gameweeks g
 where g.fantasy_season_id = '5ada3e98-2929-405a-a3f1-a26de8e51933' and g.sequence_number < 5;

-- The switch.
select app_private.fantasy_rating_points_configure('5ada3e98-2929-405a-a3f1-a26de8e51933', true, 5) as configured;

do $after$
begin
  if exists (select 1 from rating_points_baseline b
              where encode(extensions.digest(app_private.fantasy_scoring_input_document(b.id)::text, 'sha256'), 'hex') <> b.digest) then
    raise exception 'stop: the document of a gameweek before GW5 changed';
  end if;
  if exists (select 1 from app.fantasy_gameweeks g
              where g.fantasy_season_id = '5ada3e98-2929-405a-a3f1-a26de8e51933'
                and app_private.fantasy_rating_scoring_enabled(g.id) <> (g.sequence_number >= 5)) then
    raise exception 'stop: the rule does not cover exactly GW5 and later';
  end if;
end;
$after$;

-- What changed (read these before turning rollback into commit).
select season_id, from_gameweek, enabled, updated_at from app_private.fantasy_rating_policy;
select g.sequence_number as gameweek, g.status, app_private.fantasy_rating_scoring_enabled(g.id) as rating_rule,
       b.digest is not null as document_compared
  from app.fantasy_gameweeks g left join rating_points_baseline b on b.id = g.id
 where g.fantasy_season_id = '5ada3e98-2929-405a-a3f1-a26de8e51933'
 order by g.sequence_number;
select api.fantasy_rules('5ada3e98-2929-405a-a3f1-a26de8e51933') -> 'ratingScoring' as rules_page_says;

rollback;
