-- ============================================================================
-- BotolaGO Production V2 (tkewgajrljbwgwedqsxn)
-- GW3 batch 2 (2026-10-12): add three players the app has no record of, so the
-- SofaScore Fantasy recorder can accept MAT-FUS and Amal Tiznit-DHJ, which are
-- held as sofascore_unmapped_exclusion_refused.
--
-- Same engine and guards as add-sofascore-only-players.sql (2026-10-11); only
-- this header, the list and the createdBy label differ.
--
-- Owner review of 2026-10-12, before this script: the full player catalogue,
-- alternate spellings, club squads and stored SofaScore lineups hold no
-- credible existing BotolaGO record for any of the three.
--   Moad Ben El Fkih        MAT  SofaScore 2829436  (appearance in stored match data)
--   Mohamed Amine Amraoui   MAT  SofaScore 2829437  (appearance in stored match data)
--   Yassine Lhjale          DHJ  SofaScore 2805021
-- Yassine: SofaScore has two profiles with this name. 2805021 (the id the DHJ
-- match feed used) lists Wydad Serghini; 2803760 lists DHJ. This script maps
-- ONLY 2805021, the id the feed sends for DHJ, and the queue guard below
-- refuses unless that id is queued open as no_candidate for DHJ. 2803760 is
-- not mapped. Confirm the owner accepts this before committing; if SofaScore
-- later switches the DHJ lineup to 2803760, that id will be queued again and
-- must be reviewed then, never merged automatically.
--
-- BEFORE RUNNING, fill the three shirt numbers. They are null on purpose: the
-- script stops ("every player needs ... a shirt number") until they are set.
-- Read them (and the clubs' exact names) with this read-only query:
--   select q.sofascore_player_id, q.name, q.shirt_number, q.position, q.reason,
--          q.resolved_at, t.name as club, t.short_name, q.fixture_id
--   from app_private.sofascore_player_match_queue q
--   left join app.teams t on t.id = q.team_id
--   where q.sofascore_player_id in ('2829436', '2829437', '2805021', '2803760');
-- If "club" below does not match the team's name or short name exactly once,
-- the script stops; replace it with the name the query shows.
--
-- WHY
--   A starter, scorer, assister or carded player with no BotolaGO player record
--   holds the whole match (a substitute who did nothing is already left out,
--   migration 20261011190000). The auto-mapping queued each of them as
--   'no_candidate' in app_private.sofascore_player_match_queue. This script
--   gives each one a player record, a membership in his club for the match's
--   season, and a REVIEWED SofaScore mapping, then closes the queue entry.
--
-- WHAT IT DOES, per player in the list below
--   1. app.players          three new rows (no existing identity is reused).
--   2. app.team_memberships one active row for the club and the season of the
--                           match that queued him, from the season's first day
--                           (the recorder reads the squad at kickoff).
--   3. football_provider_mappings + sofascore_player_match_log
--                           exactly what api.admin_resolve_sofascore_player_match
--                           writes (method 'staff-resolution', source_version
--                           'sofascore-admin-resolve:<log id>', decided by the
--                           staff member named in OWNER_EMAIL). That is the
--                           log-based proof of "reviewed" from migration
--                           20261011130000; the script checks it with
--                           app_private.football_mapping_supporting_state.
--   4. the queue entry      resolved by that staff member.
--   No new Fantasy pool entry or price is created, and no existing pool entry
--   changes.
--   The SofaScore recorder
--   (api.service_record_sofascore_fantasy_observation) never reads the pool: it
--   needs the player's identity only, so the match is recorded with his
--   statistics. A player outside the pool cannot be picked by managers, which
--   is the right outcome for a player added only to complete a match record. To
--   offer him in Fantasy later, use the player-list update path
--   (migration 20260925200000, priced by app_private.fantasy_initial_price_v1);
--   no price is invented here.
--
-- HOW TO RUN (AGENTS.md "One writer at a time, per database")
--   1. Supabase dashboard -> project "BotolaGO Production V2" -> SQL Editor.
--      Check that nothing else is writing: no GitHub Actions run in progress;
--      this returns no rows (the script checks it again and stops if not):
--        select job.jobname, run.status, run.start_time
--        from cron.job_run_details run join cron.job job using (jobid)
--        where run.status not in ('succeeded', 'failed');
--   2. Pause and drain ALL production writers with
--      scripts/backend/sofascore-held-maintenance-pause.sql. Rehearse that
--      script, independently verify rollback, then commit its pause. Confirm
--      all cron jobs and writer switches are off and no Edge request is pending.
--      Afterwards restore the exact baseline with
--      scripts/backend/sofascore-held-maintenance-resume.sql, using the same
--      rehearsal -> independent rollback check -> commit -> readback sequence.
--   3. Fill in OWNER_EMAIL and the list (both in the first block below).
--   4. Paste this WHOLE file and press Run. As shipped it is a REHEARSAL: all
--      writes happen inside one transaction, are checked, and ROLLED BACK. The
--      checked_player_additions result, before rollback, lists the checked rows.
--   5. Independently verify rollback before proceeding. After the reviewed
--      repair is merged, change only the final `rollback;` to `commit;`.
--      Read back the rows independently to verify that they were applied.
--   If a check fails the script stops with a message saying what, and nothing
--   is saved. Do not edit a check to make it pass: a check firing means the
--   database is not in the state this script expects.
--
-- THE GUARDS (each one stops the script)
--   * the three migrations it relies on are recorded as applied;
--   * the list has no duplicate SofaScore id, name or club + shirt;
--   * OWNER_EMAIL is an active staff principal;
--   * Pepites is off and no pg_cron job is mid-run;
--   * the club resolves to exactly one team, and it is the team that queued him;
--   * the queue entry is open, reason 'no_candidate', and its name agrees with
--     the list (same normalised key); its shirt agrees when the queue has one;
--   * the SofaScore id has no mapping at all, and the app has no player of the
--     same normalised name with a membership at that club in that season;
--   * the shirt number is free at that club that season;
--   * the position is one of goalkeeper / defender / midfielder / forward;
--   * afterwards each mapping reads as active and reviewed with provenance
--     'staff_resolution', and no queue entry of the list is still open.
-- ============================================================================

-- Committed on their own: the SQL editor sends this whole file as one query,
-- and PostgreSQL would otherwise fold these settings into the transaction
-- below, so a rehearsal's rollback would clear them.
begin;
select set_config('botolago.add_players_owner_email', 'PASTE-OWNER-EMAIL', false),
  -- One object per player: sofascoreId may be null, then the id is taken from
  -- the single open no_candidate queue entry that matches name + club (+ shirt).
  -- position is optional: when null it comes from the queue entry.
  set_config('botolago.add_players_list', $list$[
    {"name": "Moad Ben El Fkih",      "club": "MAT", "shirt": null, "position": null, "sofascoreId": "2829436"},
    {"name": "Mohamed Amine Amraoui", "club": "MAT", "shirt": null, "position": null, "sofascoreId": "2829437"},
    {"name": "Yassine Lhjale",        "club": "DHJ", "shirt": null, "position": null, "sofascoreId": "2805021"}
  ]$list$, false);
commit;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
select app_private.hold_scheduled_jobs();
-- Same catalog/squad locks as the reviewed current player-list update path.
select pg_advisory_xact_lock(hashtextextended('fantasy:catalog:d03223b0-8f4a-4309-93e1-2a708d7c3584',0));
select pg_advisory_xact_lock(hashtextextended('fantasy:squads:5ada3e98-2929-405a-a3f1-a26de8e51933',0));
lock table app.team_memberships,app.fantasy_players,app.fantasy_squad_memberships in share row exclusive mode;

-- Stale shirt claim, cleared before the free-shirt guard (as in
-- repair-sofascore-held-identities.sql). The first rehearsal (2026-10-13)
-- stopped: "shirt 24 is already worn at that club this season (Mohamed Amine
-- Amraoui)". Owner read of 2026-10-13: Ayo Cha (8806c336-…) holds shirt 24 at
-- Moghreb Tétouan for 2026/27 (2026-09-24 to 2027-06-30) and held it in 2024/25,
-- with no lineup in either season and only a SportsMonks link; SofaScore's
-- stored MAT lineup gives 24 to Amraoui, who appeared. Only Ayo Cha's
-- current-season shirt number is cleared to unknown: his membership, club and
-- every other row stay as they are, and no replacement shirt is invented.
do $stale_shirt$
declare v_membership uuid; v_count integer;
begin
  if exists(select 1 from cron.job where active)
    or exists(select 1 from net.http_request_queue)
    or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled)
    or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
    or exists(select 1 from app_private.pepites_settings where mode<>'off')
  then raise exception 'stop: production writers must be paused and drained'; end if;
  select count(*), min(m.id::text)::uuid into v_count, v_membership
    from app.team_memberships m
    join app.teams t on t.id = m.team_id
   where m.player_id = '8806c336-e8d2-4977-9d9c-764e73fe3f50'
     and m.season_id = 'd03223b0-8f4a-4309-93e1-2a708d7c3584'
     and m.active and m.shirt_number = 24
     and m.valid_from = '2026-09-24' and m.valid_to = '2027-06-30'
     and t.name = 'Moghreb Tétouan';
  if v_count <> 1
    or exists(select 1 from app.lineup_players lp join app.lineups l on l.id = lp.lineup_id
      join app.fixtures f on f.id = l.fixture_id
      where lp.player_id = '8806c336-e8d2-4977-9d9c-764e73fe3f50')
    or exists(select 1 from app.player_fixture_performances p
      where p.player_id = '8806c336-e8d2-4977-9d9c-764e73fe3f50')
    or exists(select 1 from app_private.football_provider_mappings mp
      where mp.provider_name = 'sofascore' and mp.entity_type = 'player'
        and mp.internal_entity_id = '8806c336-e8d2-4977-9d9c-764e73fe3f50')
  then raise exception 'stop: Ayo Cha''s stale shirt evidence changed (membership, a lineup, an appearance or a SofaScore link)'; end if;
  update app.team_memberships set shirt_number = null where id = v_membership;
end $stale_shirt$;

-- ---------------------------------------------------------------------------
-- Preflight: the world is as this script expects
-- ---------------------------------------------------------------------------
do $preflight$
declare
  v_email text := current_setting('botolago.add_players_owner_email');
  v_list jsonb := current_setting('botolago.add_players_list')::jsonb;
begin
  if v_email = 'PASTE-OWNER-EMAIL' or position('@' in v_email) = 0 then
    raise exception 'stop: fill in OWNER_EMAIL (step 3)';
  end if;
  if jsonb_typeof(v_list) <> 'array' or jsonb_array_length(v_list) not between 1 and 20 then
    raise exception 'stop: the list must hold between 1 and 20 players';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
       where version in ('20261011120000', '20261011130000', '20261011190000')) <> 3 then
    raise exception 'stop: migrations 20261011120000, 20261011130000 and 20261011190000 are not all recorded';
  end if;
  if to_regclass('app_private.sofascore_player_match_queue') is null
    or to_regclass('app_private.sofascore_player_match_log') is null
    or to_regprocedure('app_private.football_mapping_supporting_state(uuid)') is null
    or to_regprocedure('app_private.person_name_key(text)') is null
    or to_regprocedure('app_private.football_catalog_slug(text,text,uuid)') is null then
    raise exception 'stop: the SofaScore matching tables or functions are missing';
  end if;

  -- AGENTS.md: nothing else writes players or memberships while this runs.
  if exists (select 1 from app_private.pepites_settings where mode <> 'off') then
    raise exception 'stop: Pepites is on -- pause it first with select app_private.pepites_configure(''off'', null); and restore the previous mode afterwards';
  end if;
  if exists (select 1 from cron.job_run_details run where run.status not in ('succeeded', 'failed')) then
    raise exception 'stop: a scheduled (pg_cron) job is running right now -- nothing was saved; run this again in a minute';
  end if;
  if exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
    or exists(select 1 from app_private.manager_card_settings where compute_enabled)
    or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled)
    or exists(select 1 from cron.job where active)
  then raise exception 'stop: pause and drain production writers first'; end if;
  if exists (select 1 from pg_stat_activity
              where state = 'active' and pid <> pg_backend_pid()
                and query ilike '%sofascore_player_match%') then
    raise exception 'stop: another query is working on the SofaScore player matching right now -- try again in a minute';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The work, in one block: every guard is checked per player before his writes
-- ---------------------------------------------------------------------------
do $work$
declare
  v_list jsonb := current_setting('botolago.add_players_list')::jsonb;
  v_user uuid;
  v_item jsonb;
  v_name text;
  v_key text;
  v_club_key text;
  v_shirt integer;
  v_position text;
  v_sofa text;
  v_team uuid;
  v_season record;
  q app_private.sofascore_player_match_queue%rowtype;
  v_matches integer;
  v_player uuid;
  v_existing_player uuid;
  v_obsolete uuid;
  v_log uuid;
  v_mapping uuid;
  v_state jsonb;
  v_done jsonb := '[]'::jsonb;
  v_seen_ids text[] := '{}';
  v_seen_names text[] := '{}';
  v_seen_shirts text[] := '{}';
begin
  -- Who decides: an active staff principal (the decided_by of the staff-resolution proof).
  select u.id into v_user
    from auth.users u
    join app_private.staff_principals sp on sp.auth_user_id = u.id and sp.status = 'active'
   where lower(u.email) = lower(current_setting('botolago.add_players_owner_email'));
  if v_user is null then
    raise exception 'stop: OWNER_EMAIL is not an active staff principal';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0));

  for v_item in select value from jsonb_array_elements(v_list)
  loop
    v_name := btrim(v_item ->> 'name');
    v_key := app_private.person_name_key(v_name);
    v_club_key := app_private.person_name_key(v_item ->> 'club');
    v_shirt := nullif(v_item ->> 'shirt', '')::integer;
    v_position := nullif(v_item ->> 'position', '');
    v_sofa := nullif(btrim(coalesce(v_item ->> 'sofascoreId', '')), '');
    v_existing_player := nullif(v_item ->> 'playerId', '')::uuid;
    v_obsolete := nullif(v_item ->> 'obsoleteMembershipId', '')::uuid;
    if v_key is null or v_club_key is null or v_shirt is null or v_shirt not between 1 and 99 then
      raise exception 'stop: every player needs a name, a club and a shirt number from 1 to 99 (%)', v_item;
    end if;
    if v_name || '|' || v_club_key = any (v_seen_names) or v_club_key || '|' || v_shirt = any (v_seen_shirts) then
      raise exception 'stop: % appears twice in the list (same name, or same club and shirt)', v_name;
    end if;
    v_seen_names := v_seen_names || (v_name || '|' || v_club_key);
    v_seen_shirts := v_seen_shirts || (v_club_key || '|' || v_shirt);

    -- The club: exactly one team by name or short name.
    select count(*), min(t.id::text)::uuid into v_matches, v_team
      from app.teams t
     where app_private.person_name_key(t.name) = v_club_key
        or app_private.person_name_key(t.short_name) = v_club_key;
    if v_matches <> 1 then
      raise exception 'stop: the club "%" matches % teams, expected exactly one', v_item ->> 'club', v_matches;
    end if;

    -- The queue entry: open, no_candidate, this club, this name.
    select count(*) into v_matches
      from app_private.sofascore_player_match_queue x
     where x.resolved_at is null and x.reason = 'no_candidate' and x.team_id = v_team
       and app_private.person_name_key(x.name) = v_key
       and (v_sofa is null or x.sofascore_player_id = v_sofa)
       and (x.shirt_number is null or x.shirt_number = v_shirt);
    if v_matches <> 1 then
      raise exception 'stop: % open no_candidate queue entries for "%" at "%" (shirt %), expected exactly one',
        v_matches, v_name, v_item ->> 'club', v_shirt;
    end if;
    select * into q
      from app_private.sofascore_player_match_queue x
     where x.resolved_at is null and x.reason = 'no_candidate' and x.team_id = v_team
       and app_private.person_name_key(x.name) = v_key
       and (v_sofa is null or x.sofascore_player_id = v_sofa)
       and (x.shirt_number is null or x.shirt_number = v_shirt)
       for update;
    if q.sofascore_player_id = any (v_seen_ids) then
      raise exception 'stop: SofaScore id % is used twice', q.sofascore_player_id;
    end if;
    v_seen_ids := v_seen_ids || q.sofascore_player_id;

    -- The season of the match that queued him, which must be a season in play.
    select s.id, s.starts_on, s.ends_on, s.is_current into v_season
      from app.fixtures f join app.seasons s on s.id = f.season_id
     where f.id = q.fixture_id;
    if v_season.id is null then
      raise exception 'stop: the queue entry for % has no fixture or season', v_name;
    end if;
    if not v_season.is_current then
      raise exception 'stop: the season of the match that queued % is not the current season', v_name;
    end if;

    -- The position: the list wins, else the queue; one of the four.
    v_position := coalesce(v_position, q.position);
    if v_position is null or v_position not in ('goalkeeper', 'defender', 'midfielder', 'forward') then
      raise exception 'stop: no usable position for % (list "%", queue "%")', v_name, v_item ->> 'position', q.position;
    end if;

    -- No mapping of any kind for this SofaScore id.
    if exists (select 1 from app_private.football_provider_mappings m
                where m.provider_name = 'sofascore' and m.entity_type = 'player'
                  and m.external_id = q.sofascore_player_id) then
      raise exception 'stop: SofaScore player % already has a mapping (active or not)', q.sofascore_player_id;
    end if;
    -- No same-name player already at that club this season.
    if exists (select 1 from app.team_memberships mem
                 join app.players pl on pl.id = mem.player_id
                where mem.team_id = v_team and mem.season_id = v_season.id
                  and (app_private.person_name_key(pl.full_name) = v_key
                    or app_private.person_name_key(pl.display_name) = v_key
                    or app_private.person_name_key(concat_ws(' ', pl.first_name, pl.last_name)) = v_key)) then
      raise exception 'stop: the app already has a player named "%" at that club this season -- map him through the review list instead', v_name;
    end if;
    -- The shirt number is free there.
    if exists (select 1 from app.team_memberships mem
                where mem.team_id = v_team and mem.season_id = v_season.id
                  and mem.active and mem.shirt_number = v_shirt) then
      raise exception 'stop: shirt % is already worn at that club this season (%)', v_shirt, v_name;
    end if;

    -- The queue searches only this club. A missing club membership is not a
    -- missing identity: reuse only an explicitly reviewed, unique exact name.
    select count(*), min(pl.id::text)::uuid into v_matches, v_player
      from app.players pl
     where app_private.person_name_key(pl.full_name) = v_key
        or app_private.person_name_key(pl.display_name) = v_key
        or app_private.person_name_key(concat_ws(' ', pl.first_name, pl.last_name)) = v_key;
    if v_existing_player is null and v_matches <> 0 then
      raise exception 'stop: % already exists globally -- review the existing identity, do not duplicate it', v_name;
    end if;
    if v_existing_player is not null and (v_matches <> 1 or v_player is distinct from v_existing_player
      or not exists (select 1 from app.players where id = v_existing_player and active
        and position = v_position::app.football_position)) then
      raise exception 'stop: reviewed existing identity changed for %', v_name;
    end if;
    if v_existing_player is not null and exists (select 1 from app_private.football_provider_mappings
      where provider_name = 'sofascore' and entity_type = 'player' and internal_entity_id = v_existing_player) then
      raise exception 'stop: reviewed existing identity already has a SofaScore mapping (%)', v_name;
    end if;
    if exists (select 1 from app.team_memberships where player_id = v_existing_player
      and season_id = v_season.id and active and team_id <> v_team
      and (v_obsolete is null or id <> v_obsolete)) then
      raise exception 'stop: unexpected current club membership for %', v_name;
    end if;
    if v_obsolete is not null then
      -- Exact unused stale Wydad row measured on 2026-10-11.
      -- Remove it under the catalog move rule: scoring selects by dates,
      -- not the active flag. No transfer date or Fantasy price is invented.
      if v_existing_player is distinct from '6824ba3d-1e99-472d-a3c7-9d789b24036e'::uuid
        or v_obsolete <> 'cb870b60-f432-4109-a29c-c084a2ddce0c'::uuid
        or not exists (select 1 from app.team_memberships where id = v_obsolete
          and player_id = v_existing_player and season_id = v_season.id and active
          and team_id = '80a3fb82-02ae-46bc-aae9-5160ba8f3648'
          and valid_from = '2026-09-24' and valid_to = '2027-06-30' and shirt_number is null)
        or exists (select 1 from app.player_fixture_performances p join app.fixtures f on f.id = p.fixture_id
          where p.player_id = v_existing_player and p.team_id = '80a3fb82-02ae-46bc-aae9-5160ba8f3648'
            and f.season_id = v_season.id)
        or exists (select 1 from app.lineup_players p join app.lineups l on l.id = p.lineup_id
          join app.fixtures f on f.id = l.fixture_id where p.player_id = v_existing_player
            and l.team_id = '80a3fb82-02ae-46bc-aae9-5160ba8f3648' and f.season_id = v_season.id) then
        raise exception 'stop: obsolete membership evidence changed for %', v_name;
      end if;
      if not exists(select 1 from app.fantasy_players where id='5951d4c9-fe4f-4aff-8405-3006ab34745e'
          and football_player_id=v_existing_player and fantasy_season_id='5ada3e98-2929-405a-a3f1-a26de8e51933'
          and football_team_id='80a3fb82-02ae-46bc-aae9-5160ba8f3648' and price=7.2 and selected_by_count=0)
        or exists(select 1 from app.fantasy_squad_memberships where fantasy_player_id='5951d4c9-fe4f-4aff-8405-3006ab34745e')
        or exists(select 1 from app.fantasy_lineup_players where fantasy_player_id='5951d4c9-fe4f-4aff-8405-3006ab34745e')
        or exists(select 1 from app.fantasy_transfers where '5951d4c9-fe4f-4aff-8405-3006ab34745e'::uuid in (player_in_id,player_out_id))
      then raise exception 'stop: reviewed unused Fantasy catalog entry changed'; end if;
    end if;

    -- Writes.
    v_player := coalesce(v_existing_player, gen_random_uuid());
    v_log := gen_random_uuid();
    if v_existing_player is null then
      insert into app.players (id, slug, full_name, display_name, position, preferred_foot, active)
      values (v_player, app_private.football_catalog_slug('player', v_name, v_player),
        v_name, v_name, v_position::app.football_position, 'unknown', true);
    end if;
    if v_obsolete is not null then
      delete from app.team_memberships where id = v_obsolete;
      -- Reviewed catalog move rule: change only club, keep price and identity.
      update app.fantasy_players set football_team_id=v_team where id='5951d4c9-fe4f-4aff-8405-3006ab34745e';
    end if;
    insert into app.team_memberships (player_id, team_id, season_id, shirt_number, squad_role,
      valid_from, valid_to, active)
    values (v_player, v_team, v_season.id, v_shirt, 'player', v_season.starts_on, v_season.ends_on, true);
    insert into app_private.football_provider_mappings (
      provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active,
      manually_corrected, correction_reason, corrected_by, corrected_at)
    values ('sofascore', 'player', q.sofascore_player_id, v_player,
      'sofascore-admin-resolve:' || v_log::text, statement_timestamp(), true,
      true, 'Chosen by staff from the SofaScore player review list.', v_user, statement_timestamp())
    returning id into v_mapping;
    insert into app_private.sofascore_player_match_log (id, method, mapping_id, sofascore_player_id,
      player_id, fixture_id, evidence, decided_by)
    values (v_log, 'staff-resolution', v_mapping, q.sofascore_player_id, v_player, q.fixture_id,
      jsonb_build_object('sofascoreName', q.name, 'queueReason', q.reason, 'createdBy',
        'scripts/backend/add-sofascore-only-players-gw3-batch2.sql'), v_user);
    update app_private.sofascore_player_match_queue
       set resolved_at = statement_timestamp(), resolved_by = v_user, resolved_player_id = v_player
     where sofascore_player_id = q.sofascore_player_id;

    -- The mapping must now read as reviewed, by the staff-resolution proof.
    v_state := app_private.football_mapping_supporting_state(v_mapping);
    if v_state is null or (v_state ->> 'active')::boolean is not true
      or (v_state ->> 'reviewed')::boolean is not true
      or v_state ->> 'reviewProvenance' is distinct from 'staff_resolution'
      or lower(v_state ->> 'appPlayerId') is distinct from v_player::text then
      raise exception 'stop: the new mapping for % does not read as reviewed (%)', v_name, v_state;
    end if;

    v_done := v_done || jsonb_build_array(jsonb_build_object(
      'name', v_name, 'sofascoreId', q.sofascore_player_id, 'playerId', v_player,
      'teamId', v_team, 'shirt', v_shirt, 'position', v_position));
  end loop;

  -- Nothing of the list may still be open in the queue.
  if exists (select 1 from app_private.sofascore_player_match_queue x
              where x.resolved_at is null
                and x.sofascore_player_id in (select e ->> 'sofascoreId' from jsonb_array_elements(v_done) e)) then
    raise exception 'stop: a queue entry of the list is still open after the work';
  end if;

  -- Read the result BEFORE rollback: SET, including session SET, is transactional.
  perform set_config('botolago.add_players_result', v_done::text, false);
end
$work$;

select current_setting('botolago.add_players_result')::jsonb as checked_player_additions;

-- REHEARSAL: nothing is saved. To apply for real, change only rollback to commit.
-- Independently re-read the players, memberships, mappings and queue afterwards.
rollback;
