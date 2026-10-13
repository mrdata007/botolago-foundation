-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Re-point Leander Willy Essomba Onana (CODM Meknès, shirt 10,
-- b3996984-d435-4e79-9962-d52b27407c2b) from SofaScore 2217473 to 1584851.
--
-- WHY. Wydad-CODM (SofaScore 17256972) lists him as 1584851 (#10, CODM). The
-- admin screen refused to link 1584851 because he is already linked to 2217473,
-- and a player can hold one SofaScore id only (unique key). Owner decision
-- 2026-10-13: he is the same player; use him. The link moves to the id
-- SofaScore's lineup uses, with the same staff-resolution proof the admin
-- screen writes (log row + source_version), so Fantasy reads it as reviewed.
--
-- HOW. Fill OWNER_EMAIL. Pause the writers
-- (scripts/backend/sofascore-held-maintenance-pause.sql), run this whole file
-- (it ends in rollback: a rehearsal), change only the final rollback to commit,
-- run once, then resume (sofascore-held-maintenance-resume.sql). Any "stop:"
-- means the world changed: do not edit a check.
-- ============================================================================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0));

do $repoint$
declare
  c_owner_email constant text := 'PASTE-OWNER-EMAIL';
  c_player constant uuid := 'b3996984-d435-4e79-9962-d52b27407c2b';
  v_user uuid; v_mapping uuid; v_log uuid := gen_random_uuid();
  q app_private.sofascore_player_match_queue%rowtype; proof jsonb;
begin
  if c_owner_email = 'PASTE-OWNER-EMAIL' then raise exception 'stop: fill in OWNER_EMAIL'; end if;
  select u.id into v_user from auth.users u
    join app_private.staff_principals sp on sp.auth_user_id = u.id and sp.status = 'active'
   where lower(u.email) = lower(c_owner_email);
  if v_user is null then raise exception 'stop: OWNER_EMAIL is not an active staff member'; end if;
  if exists(select 1 from cron.job where active)
    or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled)
    or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
  then raise exception 'stop: production writers must be paused and drained'; end if;

  -- His current link is exactly 2217473, active.
  select id into v_mapping from app_private.football_provider_mappings
   where provider_name = 'sofascore' and entity_type = 'player'
     and internal_entity_id = c_player and external_id = '2217473' and active;
  if v_mapping is null then raise exception 'stop: his SofaScore link is no longer 2217473'; end if;
  -- 1584851 is linked to nobody.
  if exists(select 1 from app_private.football_provider_mappings
     where provider_name = 'sofascore' and entity_type = 'player' and external_id = '1584851') then
    raise exception 'stop: 1584851 is already linked'; end if;
  -- The queue holds 1584851 open, at CODM, shirt 10, with him as the candidate.
  select * into q from app_private.sofascore_player_match_queue
   where sofascore_player_id = '1584851' for update;
  if not found or q.resolved_at is not null or q.shirt_number is distinct from 10
    or not (c_player = any(q.candidate_player_ids))
    or q.team_id is distinct from (select m.team_id from app.team_memberships m
       where m.player_id = c_player and m.active and m.shirt_number = 10
         and m.season_id = 'd03223b0-8f4a-4309-93e1-2a708d7c3584') then
    raise exception 'stop: the queue entry for 1584851 changed'; end if;

  insert into app_private.sofascore_player_match_log(id, method, mapping_id, sofascore_player_id, player_id, fixture_id, evidence, decided_by)
  values (v_log, 'staff-resolution', v_mapping, '1584851', c_player, q.fixture_id,
    jsonb_build_object('sofascoreName', q.name, 'queueReason', q.reason,
      'previousSofascoreId', '2217473',
      'ownerDecision', 'Same player as the CODM #10 already linked; link moved to the id the lineup uses (2026-10-13).',
      'createdBy', 'scripts/backend/repoint-essomba-onana-sofascore.sql'), v_user);
  update app_private.football_provider_mappings
     set external_id = '1584851', source_version = 'sofascore-admin-resolve:' || v_log::text,
         last_seen_at = statement_timestamp(), active = true, manually_corrected = true,
         correction_reason = 'Owner: same player as CODM #10; SofaScore lineup uses 1584851, not 2217473.',
         corrected_by = v_user, corrected_at = statement_timestamp()
   where id = v_mapping;
  update app_private.sofascore_player_match_queue
     set resolved_at = statement_timestamp(), resolved_by = v_user, resolved_player_id = c_player
   where sofascore_player_id = '1584851';

  proof := app_private.football_mapping_supporting_state(v_mapping);
  if (proof->>'active')::boolean is not true or (proof->>'reviewed')::boolean is not true
    or proof->>'appPlayerId' is distinct from c_player::text then
    raise exception 'stop: the moved link does not read as active and reviewed: %', proof; end if;

  -- Wydad-CODM is tried again on the next tick.
  perform app_private.sofascore_fantasy_reopen(null, q.fixture_id);
  raise notice 'repointed: %', proof;
end $repoint$;

select m.external_id, m.internal_entity_id, app_private.football_mapping_supporting_state(m.id) as proof
from app_private.football_provider_mappings m
where m.provider_name = 'sofascore' and m.entity_type = 'player'
  and m.internal_entity_id = 'b3996984-d435-4e79-9962-d52b27407c2b';

-- REHEARSAL: nothing is saved. To apply, change only this line to commit.
rollback;
