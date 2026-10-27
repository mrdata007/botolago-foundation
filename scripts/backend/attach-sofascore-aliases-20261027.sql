-- Link the SofaScore players holding three finished matches of 17-18 Oct: GUARDED SCRIPT.
-- Production: tkewgajrljbwgwedqsxn. Requires migration 20261014170000 (sofascore_catalog_aliases).
-- Authorised by the owner on 2026-10-27 ("you handle the player mappings too").
-- APPLIED 2026-10-27 ~08:55 UTC (rehearsed first, rollback re-read): aliases 5 -> 10, SofaScore
-- player mappings 479 -> 480, open list entries 21 -> 15. Live refresh paused for ~3 minutes.
-- The three held matches are in gameweek 4, already finalized, so app_private.sofascore_fantasy_reopen
-- (rightly) reopens none of them; the links serve every later match these ids appear in.
--
-- Why. DHJ-Tétouan (17 Oct), CODM-UTS (17 Oct) and Widad Témara-Kawkab (18 Oct) have no
-- Fantasy observation and no player performances: each is held on a SofaScore id on the
-- review list (app_private.sofascore_player_match_queue). WCA-Amal Tiznit (18 Oct) waits on
-- the same kind of id. Five of them are SECOND profiles of players the catalog already has:
-- in the rating snapshots of one match SofaScore first lists the player under one id and a
-- later snapshot of the same match lists him under the other, same side, same role, never
-- both ids in one snapshot.
--
--   MAIN (kept)  <- SECOND (attached)  player                       evidence
--   2322814      <- 2606326            Anass Mostakime (DHJ #12)     same club, shirt, name
--   2805021      <- 2803760            Yassine Lhjale (DHJ #31)      25 Oct: 2803760 44', later snapshot 2805021 56'
--   919649       <- 2789759            Yassine Aboursas (MAT #3)     same club, shirt, full name
--   2425983      <- 2787623            Akram Khouidssi (WT #10)      18 Oct: 2787623 then 2425983, both 90' starter
--   2621878      <- 2613942            Yassine Miloudi (CODM #30)    24 Oct: 2621878 29' then 2613942 35';
--                                                                    SofaScore now uses 2613942 ("Mohammed El Miloudi")
--
-- The sixth is an ordinary first link: SofaScore 1212072 ("Rachid Ghanimi", goalkeeper, #1,
-- WCA starter on 18 and 24 Oct) -> catalog player Rachid Ghanimi, WCA goalkeeper, no SofaScore
-- link, #1 at FUS Rabat last season. It is made exactly as api.admin_resolve_sofascore_player_match
-- makes it (mapping, staff-resolution log row, list entry closed, club's held matches reopened),
-- decided by the owner's staff account.
--
-- Not here: the older list entries of 14 Oct with no fixture (they hold nothing), and the
-- duplicate catalog row "Anass Mostakim" (same birth date as Anass Mostakime, no SofaScore link,
-- in the Fantasy pool): reported to the owner, not changed.
--
-- Before running (AGENTS.md "One writer at a time, per database"): check nothing else writes,
-- then pause the live refresh, the only other writer of these tables, keeping email as it is:
--   select app_private.notification_email_configure('live', null, null, false);
-- (mode was 'live' on 2026-10-27; read app_private.notification_email_settings first and keep
-- its mode). Afterwards: select app_private.notification_email_configure('live', null, null, true);
--
-- It DOES NOT COMMIT BY DEFAULT: with c_commit = false it runs every guard and every write, then
-- raises DRY_RUN_ROLLBACK with what it did, and the whole DO block rolls back. Re-read the tables to
-- confirm nothing changed, then set c_commit to true and run it once. A second run refuses.

do $aliases_20261027$
declare
  c_commit constant boolean := false;
  c_one_writer_checked constant boolean := false;
  c_owner constant uuid := 'd4eaa24d-ab24-45c6-9bdd-f8b8bac3b731';
  c_pairs constant jsonb := '[
    {"who": "Anass Mostakime", "main": "2322814", "second": "2606326", "player": "43817da1-f899-4ec6-8dcf-f8e745b397fa"},
    {"who": "Yassine Lhjale", "main": "2805021", "second": "2803760", "player": "d232dcae-9624-4b24-8cac-c0f5aa8e7ce7"},
    {"who": "Yassine Aboursas", "main": "919649", "second": "2789759", "player": "1b308106-c53e-4581-872a-c0f1e699d7fe"},
    {"who": "Akram Khouidssi", "main": "2425983", "second": "2787623", "player": "9e09e448-b6d0-4fba-bf4c-4c5a47f8b0b2"},
    {"who": "Yassine Miloudi", "main": "2621878", "second": "2613942", "player": "1a559e65-8337-4d69-851c-af5af406c811"}
  ]'::jsonb;
  c_link_external constant text := '1212072';
  c_link_player constant uuid := '44fc89bc-89d3-4064-b503-97cbb3840a40';
  c_evidence constant text := 'owner-authorised-aliases-2026-10-27';
  v_principal uuid;
  r record;
  m app_private.football_provider_mappings%rowtype;
  q app_private.sofascore_player_match_queue%rowtype;
  v_state jsonb;
  v_result jsonb;
  v_log uuid := gen_random_uuid();
  v_mapping uuid;
  v_done jsonb := '[]'::jsonb;
  v_reopened integer := 0;
  v_closed integer := 0;
  v_aliases_before integer;
  v_mappings_before integer;
  v_digest_before text;
  v_digest_after text;
begin
  if not c_one_writer_checked then
    raise exception 'GUARD: set c_one_writer_checked to true only after checking nothing else writes';
  end if;
  if to_regclass('app_private.sofascore_player_aliases') is null
    or to_regprocedure('app_private.sofascore_link_alias(text,uuid,uuid,jsonb)') is null
    or not exists (select 1 from supabase_migrations.schema_migrations where version = '20261014170000') then
    raise exception 'GUARD: migration 20261014170000 (sofascore_catalog_aliases) is not applied';
  end if;
  select sp.id into v_principal from app_private.staff_principals sp
   where sp.auth_user_id = c_owner and sp.status = 'active';
  if v_principal is null or not app_private.admin_has_permission(v_principal, 'football.manage_mappings') then
    raise exception 'GUARD: c_owner is not an active staff account with football.manage_mappings';
  end if;
  if exists (select 1 from app_private.notification_email_settings where football_live_refresh_enabled)
    or exists (select 1 from net.http_request_queue) then
    raise exception 'GUARD: the live refresh is not paused and drained';
  end if;
  -- The lock the matcher and the staff actions take, so none of them interleaves.
  perform pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0));

  select count(*) into v_aliases_before from app_private.sofascore_player_aliases;
  select count(*), md5(string_agg(x.id::text || x.external_id || x.internal_entity_id::text || x.active::text, ',' order by x.id))
    into v_mappings_before, v_digest_before
    from app_private.football_provider_mappings x where x.provider_name = 'sofascore' and x.entity_type = 'player';

  -- Every case is checked before anything is written.
  for r in select * from jsonb_to_recordset(c_pairs) as x(who text, main text, second text, player uuid) loop
    select * into m from app_private.football_provider_mappings x
     where x.provider_name = 'sofascore' and x.entity_type = 'player' and x.external_id = r.main;
    if not found or not m.active or m.internal_entity_id <> r.player then
      raise exception 'GUARD: % has no active main link on SofaScore id % to player %', r.who, r.main, r.player;
    end if;
    v_state := app_private.sofascore_player_identity(r.main);
    if (v_state ->> 'reviewed')::boolean is not true then
      raise exception 'GUARD: the main link % of % is not reviewed', r.main, r.who;
    end if;
    if exists (select 1 from app_private.football_provider_mappings x
                where x.provider_name = 'sofascore' and x.entity_type = 'player' and x.external_id = r.second)
      or exists (select 1 from app_private.sofascore_player_aliases a where a.sofascore_player_id = r.second) then
      raise exception 'GUARD: the second id % of % is already linked (this script has run?)', r.second, r.who;
    end if;
    if not exists (select 1 from app_private.sofascore_player_match_queue qq
                    where qq.sofascore_player_id = r.second and qq.resolved_at is null) then
      raise exception 'GUARD: % is no longer an open list entry', r.second;
    end if;
  end loop;
  select * into q from app_private.sofascore_player_match_queue
   where sofascore_player_id = c_link_external for update;
  if not found or q.resolved_at is not null then
    raise exception 'GUARD: % is not an open list entry', c_link_external;
  end if;
  if exists (select 1 from app_private.football_provider_mappings x
              where x.provider_name = 'sofascore' and x.entity_type = 'player'
                and (x.external_id = c_link_external or x.internal_entity_id = c_link_player))
    or exists (select 1 from app_private.sofascore_player_aliases a
                where a.sofascore_player_id = c_link_external or a.player_id = c_link_player) then
    raise exception 'GUARD: % or player % already has a SofaScore link', c_link_external, c_link_player;
  end if;
  if not exists (select 1 from app.team_memberships tm where tm.player_id = c_link_player
                   and tm.team_id = q.team_id and tm.active) then
    raise exception 'GUARD: player % is not an active member of the list entry''s club', c_link_player;
  end if;

  -- Five second ids.
  for r in select * from jsonb_to_recordset(c_pairs) as x(who text, main text, second text, player uuid) loop
    v_result := app_private.sofascore_link_alias(r.second, r.player, c_owner,
      jsonb_build_object('source', c_evidence, 'who', r.who, 'main', r.main));
    if (v_result ->> 'alreadyLinked')::boolean then
      raise exception 'GUARD: % was linked meanwhile', r.second;
    end if;
    v_state := app_private.sofascore_player_identity(r.second);
    if (v_state ->> 'alias')::boolean is not true or (v_state ->> 'active')::boolean is not true
      or (v_state ->> 'reviewed')::boolean is not true
      or v_state ->> 'appPlayerId' is distinct from r.player::text
      or v_state ->> 'primaryExternalId' is distinct from r.main then
      raise exception 'GUARD: % did not read back as an active, reviewed alias of %', r.second, r.main;
    end if;
    v_reopened := v_reopened + coalesce((v_result ->> 'reopened')::integer, 0);
    v_closed := v_closed + coalesce((v_result ->> 'queueClosed')::integer, 0);
    v_done := v_done || jsonb_build_array(jsonb_build_object('who', r.who, 'second', r.second));
  end loop;

  -- One first link, as api.admin_resolve_sofascore_player_match makes it.
  insert into app_private.football_provider_mappings (
    provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active,
    manually_corrected, correction_reason, corrected_by, corrected_at)
  values ('sofascore', 'player', c_link_external, c_link_player,
    'sofascore-admin-resolve:' || v_log::text, statement_timestamp(), true,
    true, 'Chosen by staff from the SofaScore player review list.', c_owner, statement_timestamp())
  on conflict do nothing
  returning id into v_mapping;
  if v_mapping is null then
    raise exception 'GUARD: the link for % conflicted', c_link_external;
  end if;
  insert into app_private.sofascore_player_match_log (id, method, mapping_id, sofascore_player_id, player_id,
    fixture_id, evidence, decided_by)
  values (v_log, 'staff-resolution', v_mapping, c_link_external, c_link_player, q.fixture_id,
    jsonb_build_object('sofascoreName', q.name, 'queueReason', q.reason, 'source', c_evidence), c_owner);
  update app_private.sofascore_player_match_queue
     set resolved_at = statement_timestamp(), resolved_by = c_owner, resolved_player_id = c_link_player
   where sofascore_player_id = c_link_external;
  v_closed := v_closed + 1;
  v_reopened := v_reopened + app_private.sofascore_fantasy_reopen(q.team_id, null);
  v_state := app_private.sofascore_player_identity(c_link_external);
  if (v_state ->> 'active')::boolean is not true or (v_state ->> 'reviewed')::boolean is not true
    or v_state ->> 'appPlayerId' is distinct from c_link_player::text then
    raise exception 'GUARD: % did not read back as an active, reviewed link', c_link_external;
  end if;
  v_done := v_done || jsonb_build_array(jsonb_build_object('who', 'Rachid Ghanimi', 'link', c_link_external));

  -- Nothing else moved: five aliases more, one mapping more, the old mappings exactly as they were.
  select md5(string_agg(x.id::text || x.external_id || x.internal_entity_id::text || x.active::text, ',' order by x.id))
    into v_digest_after
    from app_private.football_provider_mappings x
   where x.provider_name = 'sofascore' and x.entity_type = 'player' and x.id <> v_mapping;
  if v_digest_after is distinct from v_digest_before
    or (select count(*) from app_private.football_provider_mappings x
         where x.provider_name = 'sofascore' and x.entity_type = 'player') <> v_mappings_before + 1
    or (select count(*) from app_private.sofascore_player_aliases) <> v_aliases_before + jsonb_array_length(c_pairs) then
    raise exception 'GUARD: something other than the five aliases and one link changed';
  end if;

  if not c_commit then
    raise exception 'DRY_RUN_ROLLBACK: would attach % second id(s) and make 1 link, close % list entr(y/ies), set held matches to retry % time(s): %. Nothing was written.',
      jsonb_array_length(c_pairs), v_closed, v_reopened, v_done;
  end if;
  raise notice 'COMMITTED: % second id(s) attached and 1 link made, % list entr(y/ies) closed, held matches set to retry % time(s): %',
    jsonb_array_length(c_pairs), v_closed, v_reopened, v_done;
end
$aliases_20261027$;
