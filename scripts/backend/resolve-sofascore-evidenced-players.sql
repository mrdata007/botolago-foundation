-- Reviewed identity-only repair, production tkewgajrljbwgwedqsxn.
-- Evidence: docs/backend/SOFASCORE_HELD_IDENTITY_EVIDENCE_20261012.md.
-- Four existing identities only. Hamani and El Hassouni are deliberately excluded.
-- No changes to players, memberships, Fantasy prices/positions or scoring.
-- Pause/drain writers, rehearse rollback, independently verify, change only final
-- rollback to commit, verify proofs, then restore the measured writer settings.
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
    where sp.status='active' and r.name='platform_admin' and a.status='active'
      and a.revoked_at is null and a.starts_at<=statement_timestamp()
      and (a.expires_at is null or a.expires_at>statement_timestamp())
      and sp.auth_user_id='d4eaa24d-ab24-45c6-9bdd-f8b8bac3b731';
  for item in select * from (values
    ('1004247','b0bcf4a0-6712-447e-87bb-51143bd25084','Jawad Rhabra','Jawad Ghabra','1994-11-09','forward',19,'home','493eeba9-4b90-43fc-aedb-b051505b6ebf','d60d9d72-cb7a-4c94-944f-67081ef0a009','6c95e6f5-42f2-4cef-9891-ddf56ccc6b71',null,'https://www.sofascore.com/football/player/jawad-rhabra/1004247'),
    ('1186787','c8a1103a-6dc3-4b63-b93c-f6981c100f8a','Youness Najari','Younes Najjari','1996-02-06','forward',7,'away','493eeba9-4b90-43fc-aedb-b051505b6ebf','353e19d7-0a4b-41e6-a491-fc85f6c952d8','372e0e18-b9b5-457d-8785-a2157842dd78',7,'https://www.sofascore.com/football/player/youness-najari/1186787'),
    ('1140815','4f6fb6ca-95d7-4688-998d-8b4c2bfb0487','Salah Moussadak','Sallah Moussaddaq Kerboub','1998-03-23','defender',13,'home','8a07ce83-15a1-4afd-bf14-b57aacb0171c','80a3fb82-02ae-46bc-aae9-5160ba8f3648','ae2fc20a-cb46-40a6-9957-6eeed2aa9f3b',13,'https://www.sofascore.com/football/player/salah-moussadak/1140815'),
    ('880101','d9241d51-b97c-484a-ad99-1818a798d353','Hamza El Wasti','Hamza Elowasti','1995-01-01','forward',22,'away','8a07ce83-15a1-4afd-bf14-b57aacb0171c','8059c0cf-8b7b-4317-be7e-fd646d377cd0','dbe5b188-7773-4c6e-a1af-1ac016db99f1',null,'https://www.sofascore.com/football/player/hamza-el-wasti/880101')
  ) i(sofa,player,name,full_name,dob,position,shirt,side,fixture,team,membership,catalog_shirt,source)
  loop
    select * into strict q from app_private.sofascore_player_match_queue
      where sofascore_player_id=item.sofa for update;
    if q.resolved_at is not null or q.reason is distinct from 'no_candidate'
      or q.name is distinct from item.name or q.side is distinct from item.side
      or q.shirt_number is distinct from item.shirt
      or cardinality(q.candidate_player_ids) is distinct from 0
      or q.fixture_id is distinct from item.fixture::uuid
      or q.team_id is distinct from item.team::uuid
      or not exists(select 1 from app.players where id=item.player::uuid and active
        and full_name=item.full_name and date_of_birth=item.dob::date
        and position::text=item.position)
      or exists(select 1 from app_private.football_provider_mappings where provider_name='sofascore'
        and entity_type='player' and (external_id=item.sofa or internal_entity_id=item.player::uuid))
      or (select count(*) from app.team_memberships where player_id=item.player::uuid
        and season_id='d03223b0-8f4a-4309-93e1-2a708d7c3584' and active)<>1
      or not exists(select 1 from app.team_memberships where id=item.membership::uuid
        and player_id=item.player::uuid and team_id=q.team_id and active
        and season_id='d03223b0-8f4a-4309-93e1-2a708d7c3584'
        and valid_from='2026-09-24' and valid_to='2027-06-30'
        and shirt_number is not distinct from item.catalog_shirt)
      or not exists(select 1 from app_private.sofascore_fantasy_attempts at
        join app.fixtures f on f.id=at.fixture_id
        cross join lateral jsonb_array_elements(at.match_data->'lineups'->'players') lp
        where at.fixture_id=q.fixture_id and at.status='held'
          and f.season_id='d03223b0-8f4a-4309-93e1-2a708d7c3584'
          and q.team_id=case q.side when 'home' then f.home_team_id else f.away_team_id end
          and lp->>'externalId'=item.sofa and lp->>'side'=item.side
          and (lp->>'shirtNumber')::integer=item.shirt and lp->>'name'=item.name)
    then raise exception 'stop: identity, fixture, mapping, queue or membership changed for %',item.sofa; end if;
    v_log:=gen_random_uuid();
    insert into app_private.football_provider_mappings(
      provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at,active,
      manually_corrected,correction_reason,corrected_by,corrected_at)
    values('sofascore','player',item.sofa,item.player::uuid,'sofascore-admin-resolve:'||v_log::text,
      statement_timestamp(),true,true,'Staff reviewed the identity using DOB, fixture club/shirt and existing catalog; see SOFASCORE_HELD_IDENTITY_EVIDENCE_20261012.md.',
      v_user,statement_timestamp()) returning id into v_mapping;
    insert into app_private.sofascore_player_match_log(id,method,mapping_id,sofascore_player_id,
      player_id,fixture_id,evidence,decided_by)
    values(v_log,'staff-resolution',v_mapping,item.sofa,item.player::uuid,q.fixture_id,
      jsonb_build_object('sofascoreName',q.name,'queueReason',q.reason,'reviewedSource',item.source,
        'createdBy','scripts/backend/resolve-sofascore-evidenced-players.sql'),v_user);
    update app_private.sofascore_player_match_queue set resolved_at=statement_timestamp(),
      resolved_by=v_user,resolved_player_id=item.player::uuid where sofascore_player_id=item.sofa;
    v_state:=app_private.football_mapping_supporting_state(v_mapping);
    if (v_state->>'active')::boolean is not true or (v_state->>'reviewed')::boolean is not true
      or v_state->>'reviewProvenance' is distinct from 'staff_resolution'
      or v_state->>'appPlayerId' is distinct from item.player::text
    then raise exception 'stop: mapping proof does not verify for %',item.sofa; end if;
  end loop;
end $repair$;
select m.external_id,m.internal_entity_id,app_private.football_mapping_supporting_state(m.id) as proof
from app_private.football_provider_mappings m where m.provider_name='sofascore'
  and m.entity_type='player' and m.external_id in ('1004247','1186787','1140815','880101') order by m.external_id;
rollback;
