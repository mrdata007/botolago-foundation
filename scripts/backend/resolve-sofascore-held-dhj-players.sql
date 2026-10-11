-- Resolve two existing DHJ identities held by the automatic name matcher.
-- Sources independently read on 2026-10-11:
-- https://www.sofascore.com/fr/football/player/anass-moulhami/1402176
-- https://www.sofascore.com/football/player/abderrazak-ennakouss/1140816
-- https://www.besoccer.com/player/a-ennakouss-3150097 (Abderrazak Nakous alias)
-- Moulhami's DOB matches the existing player exactly. Ennakouss/Nakous is
-- the existing shirt-17 DHJ identity. The other candidate has Dominik Zak's
-- slug, display name and incompatible DOB; it is not chosen or changed.
-- No player, membership, price, position, performance or scoring row is changed.
-- Run after merging the reviewed script. Pause and drain all writers first.
-- Rehearse -> independent fingerprint/readback -> change only rollback to
-- commit -> independent readback -> restore the measured writer switches.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select app_private.hold_scheduled_jobs();
select pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map',0));
do $repair$
declare
  v_user uuid;
  item record;
  q app_private.sofascore_player_match_queue%rowtype;
  v_log uuid;
  v_mapping uuid;
  v_state jsonb;
begin
  if exists(select 1 from cron.job where active)
    or exists(select 1 from cron.job_run_details where status not in ('succeeded','failed'))
    or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled)
    or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
    or exists(select 1 from app_private.manager_card_settings where compute_enabled)
    or exists(select 1 from app_private.pepites_settings where mode<>'off')
    or exists(select 1 from net.http_request_queue)
    or exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and backend_type='client backend' and state='active')
  then raise exception 'stop: writers are not paused and drained'; end if;
  select sp.auth_user_id into strict v_user from app_private.staff_principals sp
    join app_private.staff_role_assignments a on a.staff_principal_id=sp.id
    join app_private.admin_roles r on r.id=a.role_id
    where sp.status='active' and r.name='owner'
      and sp.auth_user_id='d4eaa24d-ab24-45c6-9bdd-f8b8bac3b731';
  if not exists(select 1 from app.players where id='52b4637e-68a4-4f26-9f2d-66cb94b0f988'
      and full_name='Anas Moulhami' and date_of_birth='2001-01-17' and position='defender' and active)
    or not exists(select 1 from app.players where id='929b50af-007a-437d-8dde-b9772d4c3473'
      and full_name='Abderrazak Nakous' and display_name='Abderrazak Ennakouss' and date_of_birth is null and active)
    or not exists(select 1 from app_private.football_provider_mappings where provider_name='sportsmonks'
      and entity_type='player' and external_id='37568611'
      and internal_entity_id='929b50af-007a-437d-8dde-b9772d4c3473' and active)
    or not exists(select 1 from app.players where id='cdde89e2-075d-4555-b42e-dec4c4395109'
      and slug='dominik-zak-cdde89e2075d' and display_name='Dominik Zak' and date_of_birth='2000-04-30')
  then raise exception 'stop: independently reviewed identity evidence changed'; end if;
  for item in select * from (values
    ('1402176','52b4637e-68a4-4f26-9f2d-66cb94b0f988'::uuid,'Anass Moulhami','partial_name',4,1,
     'https://www.sofascore.com/fr/football/player/anass-moulhami/1402176'),
    ('1140816','929b50af-007a-437d-8dde-b9772d4c3473'::uuid,'Abderrazak Ennakouss','ambiguous_name',17,2,
     'https://www.sofascore.com/football/player/abderrazak-ennakouss/1140816')
  ) i(sofa,player,name,reason,shirt,candidates,source)
  loop
    select * into strict q from app_private.sofascore_player_match_queue
      where sofascore_player_id=item.sofa for update;
    if q.resolved_at is not null or q.reason is distinct from item.reason or q.name is distinct from item.name
      or q.shirt_number is distinct from item.shirt or cardinality(q.candidate_player_ids)<>item.candidates
      or not (q.candidate_player_ids @> array[item.player])
      or q.fixture_id is distinct from 'e1edd1a5-f5cd-4423-82ac-6c19ec33a66d'::uuid
      or q.team_id is distinct from 'd5d8c59b-f7ab-4b30-9dfb-1d17a36bd0fc'::uuid
      or exists(select 1 from app_private.football_provider_mappings where provider_name='sofascore'
        and entity_type='player' and (external_id=item.sofa or internal_entity_id=item.player))
      or (select count(*) from app.team_memberships where player_id=item.player
        and season_id='d03223b0-8f4a-4309-93e1-2a708d7c3584' and active
        and team_id=q.team_id and valid_from<='2026-10-10' and valid_to>='2026-10-10')<>1
    then raise exception 'stop: mapping, queue or season membership changed for %',item.sofa; end if;
    v_log:=gen_random_uuid();
    insert into app_private.football_provider_mappings(
      provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at,active,
      manually_corrected,correction_reason,corrected_by,corrected_at)
    values('sofascore','player',item.sofa,item.player,'sofascore-admin-resolve:'||v_log::text,
      statement_timestamp(),true,true,'Staff reviewed the held DHJ identity against provider profile and existing catalog.',
      v_user,statement_timestamp()) returning id into v_mapping;
    insert into app_private.sofascore_player_match_log(id,method,mapping_id,sofascore_player_id,
      player_id,fixture_id,evidence,decided_by)
    values(v_log,'staff-resolution',v_mapping,item.sofa,item.player,q.fixture_id,
      jsonb_build_object('sofascoreName',q.name,'queueReason',q.reason,'reviewedSource',item.source,
        'createdBy','scripts/backend/resolve-sofascore-held-dhj-players.sql'),v_user);
    update app_private.sofascore_player_match_queue set resolved_at=statement_timestamp(),
      resolved_by=v_user,resolved_player_id=item.player where sofascore_player_id=item.sofa;
    v_state:=app_private.football_mapping_supporting_state(v_mapping);
    if (v_state->>'active')::boolean is not true or (v_state->>'reviewed')::boolean is not true
      or v_state->>'reviewProvenance' is distinct from 'staff_resolution'
      or v_state->>'appPlayerId' is distinct from item.player::text
    then raise exception 'stop: mapping proof does not verify for %',item.sofa; end if;
  end loop;
end $repair$;
select m.external_id,m.internal_entity_id,app_private.football_mapping_supporting_state(m.id) as proof
from app_private.football_provider_mappings m where m.provider_name='sofascore'
  and m.entity_type='player' and m.external_id in ('1402176','1140816') order by m.external_id;
rollback;
