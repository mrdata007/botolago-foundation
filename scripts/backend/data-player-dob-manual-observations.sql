-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Record THREE reviewed dates of birth as manual, sourced observations.
--
-- WHAT IT CHANGES
--   For exactly three named players whose date of birth is empty today, it
--   records one "manual" observation each (with the source written down) and
--   lets the reviewed resolver set app.players.date_of_birth from it. One audit
--   event per player, in the same form the admin correction screen writes.
--   It writes NO proposal, NO mapping, NO candidate, NO Fantasy row, NO score,
--   installs NO schedule, and changes no other player.
--
-- HOW TO RUN
--   As shipped it is a REHEARSAL: everything is done inside one transaction,
--   checked, and ROLLED BACK. The last result row says "Rehearsal passed".
--   The real run (ONLY after the owner has approved the three dates) changes the
--   one `rollback;` near the end to `commit;` and nothing else. Do NOT edit a
--   check to make it pass: a check firing means the database is not in the state
--   this script was reviewed against.
--
-- UNDO (if ever needed): the observations are append-only history, so undo is a
--   new observation, never a delete -- ask for a reviewed correction.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The reviewed list. Name is the check that the id is the person meant.
create temporary table dob_import (
  player_id uuid primary key,
  expected_name text not null,
  date_of_birth date not null,
  source_ref text not null,
  note text not null
) on commit drop;

insert into dob_import (player_id, expected_name, date_of_birth, source_ref, note) values
  ('f3e4ac15-2770-48c6-a89f-5d8158404e8b', 'Zamrat', date '2002-05-15',
   'web-research:fotmob+besoccer',
   'Date of birth 2002-05-15 read on the FotMob player page (Union Touarga Sport) and BeSoccer; reviewed by the owner on 2026-10-02.'),
  ('96837dad-5250-4fd9-b0ee-8bb0dbd16d17', 'Gnolou', date '2002-12-18',
   'web-research:fotmob+sofascore',
   'Date of birth 2002-12-18 read on the FotMob and Sofascore player pages (Claude Gnolou); reviewed by the owner on 2026-10-02.'),
  ('721d92d0-1763-43b9-9b9c-54edcc03c07b', 'Conté', date '2004-04-15',
   'web-research:fotmob+fbref+flashscore',
   'Date of birth 2004-04-15 read on the FotMob, FBref and Flashscore player pages (Moussa Balla Conté); reviewed by the owner on 2026-10-02.');

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $preflight$
declare
  v_actor_count integer;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'stop: supabase_migrations.schema_migrations does not exist -- is this the BotolaGO database?';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations
      where name in ('news_engine_core', 'news_engine_seed', 'fantasy_incremental_envelope_fail_closed')) then
    raise exception 'stop: a staging-only migration is recorded -- this looks like STAGING, not Production V2';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260926060000')
    or not exists (select 1 from supabase_migrations.schema_migrations where version = '20260926120000') then
    raise exception 'stop: the player attribute provenance migrations are not recorded';
  end if;
  if to_regprocedure('app_private.record_player_attribute_observation(uuid,text,text,numeric,text,text,text,timestamp with time zone,uuid,text)') is null
    or to_regprocedure('app_private.resolve_player_attributes(uuid[])') is null then
    raise exception 'stop: the player attribute functions are missing';
  end if;

  -- Each person is the one meant, has no date of birth yet, and has never had
  -- a date-of-birth observation recorded from any source.
  if (select count(*) from dob_import) <> 3 then
    raise exception 'stop: the reviewed list is not three players';
  end if;
  if exists (select 1 from dob_import i
      where not exists (select 1 from app.players p
        where p.id = i.player_id and p.active
          and (p.full_name ilike '%' || i.expected_name || '%' or p.display_name ilike '%' || i.expected_name || '%'))) then
    raise exception 'stop: a listed player is missing, inactive, or is not the person named';
  end if;
  if exists (select 1 from dob_import i join app.players p on p.id = i.player_id where p.date_of_birth is not null) then
    raise exception 'stop: a listed player already has a date of birth';
  end if;
  if exists (select 1 from app_private.player_attribute_observations o
      join dob_import i on i.player_id = o.player_id where o.attribute = 'date_of_birth') then
    raise exception 'stop: a listed player already has a date-of-birth observation';
  end if;

  -- The person who "makes" the correction: exactly one active staff member who
  -- holds football.correct. Anything else and we do not guess.
  select count(*) into v_actor_count
  from app_private.staff_principals sp
  where sp.status = 'active' and app_private.admin_has_permission(sp.id, 'football.correct');
  if v_actor_count <> 1 then
    raise exception 'stop: expected exactly one active staff member holding football.correct, found %', v_actor_count;
  end if;

  -- Nothing about the mapping workflow may exist yet that this could touch.
  if exists (select 1 from app_private.football_player_mapping_proposals) then
    raise exception 'stop: a mapping proposal exists -- review this script against it first';
  end if;

  -- One writer at a time.
  if exists (select 1 from pg_catalog.pg_stat_activity
      where pid <> pg_backend_pid() and backend_type = 'client backend'
        and state in ('active', 'idle in transaction', 'idle in transaction (aborted)')) then
    raise exception 'stop: another database session is working right now -- wait for it to finish (one writer at a time)';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- What must not change, as it is now (dropped with the transaction)
-- ---------------------------------------------------------------------------
create temporary table dob_baseline on commit drop as
select
  (select count(*) from app_private.football_provider_mappings) as mapping_count,
  (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from app_private.football_provider_mappings m) as mapping_digest,
  (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from app_private.football_player_mapping_candidates c) as candidate_digest,
  (select count(*) from app_private.football_player_mapping_proposals) as proposals,
  (select count(*) from app_private.player_attribute_observations) as observations,
  (select count(*) from app_private.admin_audit_events) as audit_events,
  (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), ''))
    from cron.job) as cron_digest,
  (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g) as gameweek_digest,
  (select count(*) from app.fantasy_player_gameweek_points) as fantasy_points,
  (select count(*) from app.players) as players,
  -- every OTHER player, whole row, so nothing but the three can have moved
  (select md5(coalesce(string_agg(p::text, '|' order by p.id), ''))
    from app.players p where p.id not in (select player_id from dob_import)) as other_players_digest,
  (select md5(coalesce(string_agg(o::text, '|' order by o.id), ''))
    from app_private.player_attribute_observations o) as observations_digest;

-- ---------------------------------------------------------------------------
-- The change
-- ---------------------------------------------------------------------------
do $change$
declare
  v_actor uuid;
  v_row dob_import%rowtype;
  v_observation uuid;
begin
  select sp.id into strict v_actor
  from app_private.staff_principals sp
  where sp.status = 'active' and app_private.admin_has_permission(sp.id, 'football.correct');

  for v_row in select * from dob_import order by player_id loop
    v_observation := app_private.record_player_attribute_observation(
      v_row.player_id, 'date_of_birth', v_row.date_of_birth::text, null,
      'manual', null, v_row.source_ref, statement_timestamp(), v_actor, v_row.note);
    perform app_private.resolve_player_attributes(array[v_row.player_id]);
    perform app_private.write_admin_audit(v_actor, 'football.player_attribute_correct', 'football',
      v_row.player_id, v_row.note, gen_random_uuid(), gen_random_uuid(), null, null,
      pg_catalog.jsonb_build_object('attribute', 'date_of_birth', 'observationId', v_observation));
  end loop;
end
$change$;

-- ---------------------------------------------------------------------------
-- Postflight: exactly the three, nothing else
-- ---------------------------------------------------------------------------
do $postflight$
declare
  b dob_baseline%rowtype;
  problems text[] := '{}';
begin
  select * into strict b from dob_baseline;

  if (select count(*) from dob_import i join app.players p on p.id = i.player_id
      where p.date_of_birth is distinct from i.date_of_birth) <> 0 then
    problems := problems || 'a listed player does not carry the reviewed date'::text;
  end if;
  if (select count(*) from app_private.player_attribute_observations) <> b.observations + 3 then
    problems := problems || 'the observation count did not grow by exactly three'::text;
  end if;
  if (select count(*) from app_private.player_attribute_observations o join dob_import i on i.player_id = o.player_id
      where o.attribute = 'date_of_birth' and o.source_kind = 'manual' and o.superseded_at is null
        and o.value_text = i.date_of_birth::text and o.recorded_by is not null) <> 3 then
    problems := problems || 'the three manual observations are not as reviewed'::text;
  end if;
  if (select count(*) from app_private.admin_audit_events) <> b.audit_events + 3 then
    problems := problems || 'the audit count did not grow by exactly three'::text;
  end if;
  if (select md5(coalesce(string_agg(p::text, '|' order by p.id), ''))
      from app.players p where p.id not in (select player_id from dob_import)) is distinct from b.other_players_digest
    or (select count(*) from app.players) <> b.players then
    problems := problems || 'a player other than the three changed'::text;
  end if;
  -- Of the three, only the date of birth (and updated_at) moved: no name, slug,
  -- position, foot or activity change.
  if exists (select 1 from app_private.player_attribute_observations o
      join dob_import i on i.player_id = o.player_id
      where o.attribute <> 'date_of_birth' and o.created_at >= statement_timestamp() - interval '1 minute') then
    problems := problems || 'another attribute was recorded for a listed player'::text;
  end if;
  if (select count(*) from app_private.football_provider_mappings) <> b.mapping_count
    or (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from app_private.football_provider_mappings m) is distinct from b.mapping_digest then
    problems := problems || 'a mapping row changed'::text;
  end if;
  if (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from app_private.football_player_mapping_candidates c) is distinct from b.candidate_digest
    or (select count(*) from app_private.football_player_mapping_proposals) <> b.proposals then
    problems := problems || 'a mapping candidate or proposal changed'::text;
  end if;
  if (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), ''))
      from cron.job) is distinct from b.cron_digest then
    problems := problems || 'a schedule changed'::text;
  end if;
  if (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g) is distinct from b.gameweek_digest
    or (select count(*) from app.fantasy_player_gameweek_points) <> b.fantasy_points then
    problems := problems || 'a Fantasy row changed'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: postflight failed: %', array_to_string(problems, '; ');
  end if;
  raise notice 'DOB IMPORT POSTFLIGHT PASSED: three players, three observations, three audit events';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. The real run changes the next line to `commit;`
-- and nothing else.
-- ---------------------------------------------------------------------------
rollback;

select case
  when exists (select 1 from app_private.player_attribute_observations
      where player_id in ('f3e4ac15-2770-48c6-a89f-5d8158404e8b', '96837dad-5250-4fd9-b0ee-8bb0dbd16d17', '721d92d0-1763-43b9-9b9c-54edcc03c07b')
        and attribute = 'date_of_birth')
    then 'Applied. Three dates of birth recorded as manual observations.'
  else 'Rehearsal passed. Nothing was saved.'
end as result;
