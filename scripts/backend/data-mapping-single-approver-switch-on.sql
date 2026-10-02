-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Turn the player-mapping SINGLE-APPROVER switch back ON: controlled
-- single-operator mapping mode (owner decision, 2026-10-02).
--
-- WHAT IT CHANGES
--   Exactly one thing:
--     update app_private.football_mapping_settings
--     set allow_self_approval = true
--     where allow_self_approval = false;
--   and it requires exactly ONE row to be affected. This is the same reviewed
--   switch the migration 20261002100000 installed; no second implementation.
--   Turning it on lets the same qualified operator approve their own proposal; it
--   changes nothing else: proposing, approving and executing stay three separate
--   deliberate actions, and every check (football.manage_mappings, a signed-in
--   human, AAL2, recent sign-in, a written reason, the exact fingerprint, the
--   evidence re-check, idempotency, append-only audit) is untouched.
--   The first production mapping, its proposal, its audit events, every candidate,
--   every other mapping, Fantasy and the schedules are checked before and after and
--   must be byte-identical. Nothing is inserted or deleted.
--
-- HOW TO RUN
--   As shipped it is a REHEARSAL: the change is made inside the transaction,
--   checked, and ROLLED BACK. The result row says "Rehearsal passed".
--   The real run (only after the owner approved it) changes the one `rollback;`
--   to `commit;` and nothing else. Do NOT edit a check to make it pass: a check
--   firing means production is not in the state this script was reviewed against.
--   It STOPS if any proposal is pending, approved or otherwise still open.
--
-- TURNING THE TWO-PERSON RULE BACK ON LATER
--   data-mapping-single-approver-switch-off.sql (guarded, rehearsal first).
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
  if exists (select 1 from supabase_migrations.schema_migrations
      where name in ('news_engine_core', 'news_engine_seed', 'fantasy_incremental_envelope_fail_closed')) then
    raise exception 'stop: a staging-only migration is recorded -- this looks like STAGING, not Production V2';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261002100000') then
    raise exception 'stop: the single-approver migration (20261002100000) is not recorded';
  end if;

  -- The switch: exactly one row, currently ON.
  if (select count(*) from app_private.football_mapping_settings) <> 1 then
    raise exception 'stop: the settings table does not hold exactly one row';
  end if;
  if coalesce((select allow_self_approval from app_private.football_mapping_settings where singleton), true) then
    raise exception 'stop: the single-approver switch is not OFF';
  end if;

  -- Proposals: exactly the one executed first mapping, nothing open that the switch could affect.
  if (select count(*) from app_private.football_player_mapping_proposals) <> 1
    or (select count(*) from app_private.football_player_mapping_proposals where status = 'executed') <> 1 then
    raise exception 'stop: production does not hold exactly one proposal, and it executed';
  end if;
  if exists (select 1 from app_private.football_player_mapping_proposals
      where status in ('pending', 'approved', 'position_disagreement', 'stale_evidence')) then
    raise exception 'stop: a proposal is still open (pending, approved or held) -- report it, do not switch';
  end if;
  if not exists (select 1 from app_private.football_player_mapping_proposals
      where id = 'add2150a-4d34-4e7c-abf1-0017e68bc89d' and status = 'executed' and kind = 'map'
        and sofascore_external_id = '359280'
        and sofascore_candidate_id = '166598ad-5934-44fa-aa40-a0ad69a4a010'
        and app_player_id = '6c06addc-4cdc-4598-ba94-42221728122b') then
    raise exception 'stop: the executed proposal is not the first Sofascore mapping that was reviewed';
  end if;

  -- The mappings: 1,542 rows, exactly one reviewed-provider row, and it is the first mapping, active.
  if (select count(*) from app_private.football_provider_mappings) <> 1542
    or (select count(*) from app_private.football_provider_mappings where provider_name in ('sofascore', 'flashscore')) <> 1 then
    raise exception 'stop: the mapping table is not 1,542 rows with exactly one reviewed-provider row';
  end if;
  if not exists (select 1 from app_private.football_provider_mappings
      where id = '3f867678-cb4e-4362-99c3-a2850b34ccb0' and provider_name = 'sofascore' and external_id = '359280'
        and internal_entity_id = '6c06addc-4cdc-4598-ba94-42221728122b' and entity_type = 'player' and active) then
    raise exception 'stop: the first mapping row is not the reviewed one, active';
  end if;
  if (select count(*) from app_private.football_player_mapping_candidates) <> 1004
    or (select count(*) from app_private.football_player_mapping_observations) <> 1006 then
    raise exception 'stop: the candidate or observation population is not what was reviewed';
  end if;
  if (select md5(m::text) from app_private.football_provider_mappings m where m.id = '3f867678-cb4e-4362-99c3-a2850b34ccb0') is distinct from '41e82d12a6a5dc65516ac91dad70c605'
    or (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from app_private.football_player_mapping_proposals p) is distinct from 'c76c1e3124d30e330a5e2b6fc8ea8ed8' then
    raise exception 'stop: the first mapping row or its proposal is not byte-identical to what was reviewed';
  end if;
  if (select count(*) from app_private.football_player_mapping_candidates where status = 'mapped') <> 1
    or not exists (select 1 from app_private.football_player_mapping_candidates
      where id = '166598ad-5934-44fa-aa40-a0ad69a4a010' and status = 'mapped'
        and existing_mapping_id = '3f867678-cb4e-4362-99c3-a2850b34ccb0') then
    raise exception 'stop: the first candidate is not the only mapped candidate';
  end if;
  if exists (select 1 from app.fantasy_gameweeks where status = 'finalizing') then
    raise exception 'stop: a Fantasy gameweek is finalizing right now';
  end if;

  -- The functions that read the switch are the reviewed ones, and the guard trigger exists.
  if md5(pg_get_functiondef('api.admin_football_mapping_decide(uuid,text,text,text,boolean,uuid)'::regprocedure)) is distinct from 'b20ebace94787e95c67c40181feabf80'
    or md5(pg_get_functiondef('api.admin_football_mapping_execute(uuid,uuid)'::regprocedure)) is distinct from '1c0951a9f61cf0baa2970b720b90cfb4'
    or md5(pg_get_functiondef('api.admin_football_mapping_reviewer_availability()'::regprocedure)) is distinct from '449d1b206047f95df01cee5328772edb'
    or md5(pg_get_functiondef('app_private.football_mapping_proposal_json(app_private.football_player_mapping_proposals,uuid)'::regprocedure)) is distinct from '6a8c59637e47817876622e163a2b53b2' then
    raise exception 'stop: a function that reads the switch is not the reviewed text';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger
      where tgrelid = 'app_private.football_player_mapping_proposals'::regclass
        and tgname = 'football_player_mapping_proposals_self_decision_guard' and not tgisinternal) then
    raise exception 'stop: the self-decision guard trigger is missing';
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
create temporary table switch_on_baseline on commit drop as
select
  (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from app_private.football_player_mapping_proposals p) as proposals_digest,
  (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from app_private.football_provider_mappings m) as mappings_digest,
  (select md5(m::text) from app_private.football_provider_mappings m where m.id = '3f867678-cb4e-4362-99c3-a2850b34ccb0') as first_mapping_digest,
  (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from app_private.football_player_mapping_candidates c) as candidates_digest,
  (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from app_private.football_player_mapping_observations o) as mapping_observations_digest,
  (select count(*) from app_private.admin_audit_events) as audit_events,
  (select md5(coalesce(string_agg(a::text, '|' order by a.id), '')) from app_private.admin_audit_events a) as audit_digest,
  (select count(*) from app_private.admin_idempotency_keys) as idempotency_keys,
  (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from app.players p) as players_digest,
  (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from app_private.player_attribute_observations o) as attribute_observations_digest,
  (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), '')) from cron.job) as cron_digest,
  (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g) as gameweek_digest,
  (select jsonb_object_agg(t.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', 'app', t.relname), false, true, '')))[1]::text::bigint)
    from pg_class t where t.relnamespace = 'app'::regnamespace and t.relkind = 'r' and t.relname like 'fantasy%') as fantasy_counts,
  (select count(*) from supabase_migrations.schema_migrations) as history_rows,
  (select updated_at from app_private.football_mapping_settings) as settings_updated_at;

-- ---------------------------------------------------------------------------
-- The one change
-- ---------------------------------------------------------------------------
do $change$
declare
  v_rows integer;
begin
  update app_private.football_mapping_settings
  set allow_self_approval = true
  where allow_self_approval = false;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'stop: expected exactly one settings row to change, changed %', v_rows;
  end if;
end
$change$;

-- ---------------------------------------------------------------------------
-- Postflight: the switch is off and nothing else moved
-- ---------------------------------------------------------------------------
do $postflight$
declare
  b switch_on_baseline%rowtype;
  problems text[] := '{}';
begin
  select * into strict b from switch_on_baseline;

  if (select count(*) from app_private.football_mapping_settings) <> 1
    or (select allow_self_approval from app_private.football_mapping_settings where singleton) is distinct from true then
    problems := problems || 'the switch is not exactly one row, on'::text;
  end if;
  if app_private.football_mapping_self_approval_allowed() is distinct from true then
    problems := problems || 'the switch reader does not allow self-approval'::text;
  end if;
  if (select updated_at from app_private.football_mapping_settings) is distinct from b.settings_updated_at then
    problems := problems || 'another column of the settings row changed'::text;
  end if;
  if (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from app_private.football_player_mapping_proposals p) is distinct from b.proposals_digest
    or (select count(*) from app_private.football_player_mapping_proposals where status = 'executed') <> 1 then
    problems := problems || 'the proposal changed'::text;
  end if;
  if (select md5(coalesce(string_agg(m::text, '|' order by m.id), '')) from app_private.football_provider_mappings m) is distinct from b.mappings_digest
    or (select md5(m::text) from app_private.football_provider_mappings m where m.id = '3f867678-cb4e-4362-99c3-a2850b34ccb0') is distinct from b.first_mapping_digest
    or (select count(*) from app_private.football_provider_mappings) <> 1542 then
    problems := problems || 'a mapping row changed'::text;
  end if;
  if (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from app_private.football_player_mapping_candidates c) is distinct from b.candidates_digest
    or (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from app_private.football_player_mapping_observations o) is distinct from b.mapping_observations_digest then
    problems := problems || 'a candidate or observation changed'::text;
  end if;
  if (select count(*) from app_private.admin_audit_events) <> b.audit_events
    or (select md5(coalesce(string_agg(a::text, '|' order by a.id), '')) from app_private.admin_audit_events a) is distinct from b.audit_digest
    or (select count(*) from app_private.admin_idempotency_keys) <> b.idempotency_keys then
    problems := problems || 'an audit event or idempotency key changed'::text;
  end if;
  if (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from app.players p) is distinct from b.players_digest
    or (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from app_private.player_attribute_observations o) is distinct from b.attribute_observations_digest then
    problems := problems || 'a player or player observation changed'::text;
  end if;
  if (select md5(coalesce(string_agg(jobid::text || ':' || schedule || ':' || command || ':' || active::text, '|' order by jobid), '')) from cron.job) is distinct from b.cron_digest
    or (select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) from app.fantasy_gameweeks g) is distinct from b.gameweek_digest
    or (select jsonb_object_agg(t.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', 'app', t.relname), false, true, '')))[1]::text::bigint)
        from pg_class t where t.relnamespace = 'app'::regnamespace and t.relkind = 'r' and t.relname like 'fantasy%') is distinct from b.fantasy_counts then
    problems := problems || 'a schedule or Fantasy row changed'::text;
  end if;
  if (select count(*) from supabase_migrations.schema_migrations) <> b.history_rows then
    problems := problems || 'the migration history changed'::text;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'stop: postflight failed: %', array_to_string(problems, '; ');
  end if;
  raise notice 'SWITCH-ON POSTFLIGHT PASSED: switch on, nothing else changed';
end
$postflight$;

-- ---------------------------------------------------------------------------
-- REHEARSAL: nothing is saved. The real run changes the next line to `commit;`
-- and nothing else.
-- ---------------------------------------------------------------------------
rollback;

select case
  when (select allow_self_approval from app_private.football_mapping_settings where singleton) is true
    then 'Applied. The single-approver switch is ON: single-operator mapping mode.'
  else 'Rehearsal passed. Nothing was saved.'
end as result;
