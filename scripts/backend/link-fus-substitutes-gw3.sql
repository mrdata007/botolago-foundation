-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- Link the two FUS substitutes of MAT-FUS (SofaScore 17256974) to the FUS
-- players who wear their shirts, so the match no longer has to leave anyone out.
--   SofaScore 1857030  Abdsselam Lachhab        #19  (owner read 2026-10-13: FUS #19
--                                                     is Abdesalem Al Achhab)
--   SofaScore 1612935  Mehdi Bellarabi Boubker  #13
-- Neither has a matcher queue entry, so the admin screen cannot link them.
--
-- FUS is found from the fixture itself (the side that is not MAT), never by
-- name. Each SofaScore id is linked to the ONE active FUS member of the
-- 2026/27 season wearing that shirt, who has no SofaScore link yet. Anything
-- else stops the script and lists the FUS players without a SofaScore link
-- (name, shirt, position), so the owner can say who he is. Links are written
-- with the same staff-resolution proof the admin screen writes (log row +
-- source_version), so Fantasy reads them as reviewed. The match is reopened.
--
-- HOW. Fill OWNER_EMAIL. Pause the writers
-- (scripts/backend/sofascore-held-maintenance-pause.sql), run this whole file
-- (it ends in rollback: a rehearsal), change only the final rollback to commit,
-- run once, then resume (sofascore-held-maintenance-resume.sql).
-- ============================================================================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0));

do $link$
declare
  c_owner_email constant text := 'PASTE-OWNER-EMAIL';
  c_season constant uuid := 'd03223b0-8f4a-4309-93e1-2a708d7c3584';
  v_user uuid; v_fixture uuid; v_fus uuid; v_mat uuid;
  item record; v_player uuid; v_count integer; v_mapping uuid; v_log uuid; proof jsonb;
  v_unlinked text;
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

  -- The fixture, and FUS as the side that is not MAT (MAT holds Amraoui's link).
  select a.fixture_id into v_fixture from app_private.sofascore_fantasy_attempts a
   where a.sofascore_event_id = '17256974';
  if v_fixture is null then raise exception 'stop: MAT-FUS (17256974) not found'; end if;
  select m.team_id into v_mat from app.team_memberships m
    join app_private.football_provider_mappings mp on mp.internal_entity_id = m.player_id
   where mp.provider_name = 'sofascore' and mp.entity_type = 'player' and mp.external_id = '2829437'
     and m.active and m.season_id = c_season;
  select case when f.home_team_id = v_mat then f.away_team_id
              when f.away_team_id = v_mat then f.home_team_id end
    into v_fus from app.fixtures f where f.id = v_fixture;
  if v_mat is null or v_fus is null then raise exception 'stop: could not tell MAT from FUS in the fixture'; end if;

  select string_agg(p.full_name || ' #' || coalesce(m.shirt_number::text, '?') || ' ' || coalesce(p.position::text, '?'),
                    ' | ' order by m.shirt_number nulls last)
    into v_unlinked
    from app.team_memberships m join app.players p on p.id = m.player_id
   where m.team_id = v_fus and m.season_id = c_season and m.active
     and not exists(select 1 from app_private.football_provider_mappings mp
       where mp.provider_name = 'sofascore' and mp.entity_type = 'player' and mp.internal_entity_id = p.id);

  for item in select * from (values ('1857030', 'Abdsselam Lachhab', 19),
                                    ('1612935', 'Mehdi Bellarabi Boubker', 13)) x(sid, sname, shirt)
  loop
    if exists(select 1 from app_private.football_provider_mappings
       where provider_name = 'sofascore' and entity_type = 'player' and external_id = item.sid) then
      raise exception 'stop: SofaScore % is already linked', item.sid; end if;
    select count(*), min(m.player_id::text)::uuid into v_count, v_player
      from app.team_memberships m
     where m.team_id = v_fus and m.season_id = c_season and m.active and m.shirt_number = item.shirt
       and not exists(select 1 from app_private.football_provider_mappings mp
         where mp.provider_name = 'sofascore' and mp.entity_type = 'player' and mp.internal_entity_id = m.player_id);
    if v_count <> 1 then
      raise exception 'stop: % FUS players without a SofaScore link wear #% (expected one) for % (%). FUS players without a SofaScore link: %',
        v_count, item.shirt, item.sname, item.sid, coalesce(v_unlinked, 'none');
    end if;

    v_log := gen_random_uuid();
    insert into app_private.football_provider_mappings(provider_name, entity_type, external_id,
      internal_entity_id, source_version, last_seen_at, active, manually_corrected, correction_reason,
      corrected_by, corrected_at)
    values ('sofascore', 'player', item.sid, v_player, 'sofascore-admin-resolve:' || v_log::text,
      statement_timestamp(), true, true,
      'Owner 2026-10-13: FUS #' || item.shirt || ' in the MAT-FUS SofaScore lineup is this player.',
      v_user, statement_timestamp())
    returning id into v_mapping;
    insert into app_private.sofascore_player_match_log(id, method, mapping_id, sofascore_player_id, player_id, fixture_id, evidence, decided_by)
    values (v_log, 'staff-resolution', v_mapping, item.sid, v_player, v_fixture,
      jsonb_build_object('sofascoreName', item.sname, 'shirt', item.shirt, 'club', 'FUS (from fixture)',
        'createdBy', 'scripts/backend/link-fus-substitutes-gw3.sql'), v_user);
    proof := app_private.football_mapping_supporting_state(v_mapping);
    if (proof->>'active')::boolean is not true or (proof->>'reviewed')::boolean is not true
      or proof->>'appPlayerId' is distinct from v_player::text then
      raise exception 'stop: the new link for % does not read as active and reviewed: %', item.sid, proof; end if;
    raise notice 'linked % (%) to %', item.sid, item.sname, v_player;
  end loop;

  perform app_private.sofascore_fantasy_reopen(null, v_fixture);
end $link$;

select mp.external_id, p.full_name, app_private.football_mapping_supporting_state(mp.id) ->> 'reviewed' as reviewed
from app_private.football_provider_mappings mp join app.players p on p.id = mp.internal_entity_id
where mp.provider_name = 'sofascore' and mp.entity_type = 'player' and mp.external_id in ('1857030', '1612935');

-- REHEARSAL: nothing is saved. To apply, change only this line to commit.
rollback;
