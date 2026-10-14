-- Attach the second SofaScore ids the owner verified on 2026-10-14: GUARDED OWNER-RUN SCRIPT.
-- Production: tkewgajrljbwgwedqsxn. Requires migration 20261014170000 (sofascore_catalog_aliases).
--
-- SofaScore keeps two profiles of these five players. Each pair is MAIN <- SECOND: the main id keeps
-- the player's link (names, shirt and photo still come from it), the second id becomes an alias, so a
-- match where SofaScore uses it scores the same player.
--   Imad Errahouli        919620 <- 2033439
--   Yassine Senhaji       2033440 <- 2045584
--   Ismail Sbahe          2762914 <- 2787361   (SofaScore moved his 2026-09-26 appearance to 2762914)
--   Aymen el Aatga        1866448 <- 2790048
--   Mohammad Abu Zrayq    2837528 <- 986341    (the id SofaScore uses in 2026/27 lineups)
-- Abu Zrayq: the owner moves his main link from 986341 to 2837528 with a separate script. Run that
-- one FIRST. This script reads which state production is in and handles both, explicitly:
--   moved      main link on 2837528, no row for 986341      -> 986341 becomes the alias (intended);
--   not moved  main link on 986341, no row for 2837528      -> 2837528 becomes the alias, and the
--              notice says so (the move script then refuses: an alias id cannot take a mapping);
--   anything else (both ids mapped, one inactive, one already an alias of someone) -> GUARD, nothing.
-- Walid El Hani (2351784) is NOT here: uncertain, left on the list for a person to decide.
--
-- For each pair it checks that the main id is an active, reviewed link of one catalog player and that
-- the second id is linked to nobody, then calls app_private.sofascore_link_alias as the owner: the
-- alias row, its staff-alias log row (decided_by = the owner), the list entry closed, and the held
-- Fantasy matches of the player's clubs set to be tried again on the next tick.
--
-- Before running (AGENTS.md "One writer at a time, per database"): list running agents and
-- workflows, pause and drain every writer with sofascore-rating-release-pause.sql, then set
-- c_one_writer_checked to true and c_owner_text to the owner's auth user id (a staff account with
-- football.manage_mappings). Afterwards resume with sofascore-rating-release-resume.sql.
--
-- It DOES NOT COMMIT BY DEFAULT: with c_commit = false it runs every guard and every write, then
-- raises DRY_RUN_ROLLBACK with what it did, and the whole DO block is rolled back. Read the message,
-- re-read app_private.sofascore_player_aliases to confirm it is unchanged, then set c_commit to true
-- and run it once. A second run refuses (the aliases exist). Never loosen a guard: a guard that fires
-- means production is not in the state this script was written for.

do $verified_aliases$
declare
  c_commit constant boolean := false;
  c_one_writer_checked constant boolean := false;
  c_owner_text constant text := 'REPLACE-WITH-OWNER-AUTH-USER-ID';
  c_pairs constant jsonb := '[
    {"who": "Imad Errahouli", "main": "919620", "second": "2033439"},
    {"who": "Yassine Senhaji", "main": "2033440", "second": "2045584"},
    {"who": "Ismail Sbahe", "main": "2762914", "second": "2787361"},
    {"who": "Aymen el Aatga", "main": "1866448", "second": "2790048"}
  ]'::jsonb;
  c_evidence constant text := 'owner-verified-aliases-2026-10-14';
  v_owner uuid;
  v_principal uuid;
  v_pairs jsonb;
  v_abu text;
  r record;
  m app_private.football_provider_mappings%rowtype;
  v_state jsonb;
  v_result jsonb;
  v_done jsonb := '[]'::jsonb;
  v_reopened integer := 0;
  v_closed integer := 0;
  v_aliases_before integer;
  v_main_digest_before text;
  v_main_digest_after text;
begin
  if not c_one_writer_checked then
    raise exception 'GUARD: set c_one_writer_checked to true only after checking nothing else writes';
  end if;
  if c_owner_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'GUARD: set c_owner_text to the owner auth user id (auth.users.id of the staff account)';
  end if;
  v_owner := c_owner_text::uuid;
  if to_regclass('app_private.sofascore_player_aliases') is null
    or to_regprocedure('app_private.sofascore_link_alias(text,uuid,uuid,jsonb)') is null
    or not exists (select 1 from supabase_migrations.schema_migrations where version = '20261014170000') then
    raise exception 'GUARD: migration 20261014170000 (sofascore_catalog_aliases) is not applied';
  end if;
  select sp.id into v_principal from app_private.staff_principals sp
   where sp.auth_user_id = v_owner and sp.status = 'active';
  if v_principal is null or not app_private.admin_has_permission(v_principal, 'football.manage_mappings') then
    raise exception 'GUARD: c_owner_text is not an active staff account with football.manage_mappings';
  end if;
  if exists (select 1 from cron.job where active)
    or exists (select 1 from cron.job_run_details where status not in ('succeeded', 'failed'))
    or exists (select 1 from app_private.notification_email_settings where football_live_refresh_enabled)
    or exists (select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
    or exists (select 1 from app_private.manager_card_settings where compute_enabled)
    or exists (select 1 from app_private.pepites_settings where mode <> 'off')
    or exists (select 1 from net.http_request_queue) then
    raise exception 'GUARD: the writers are not paused and drained (sofascore-rating-release-pause.sql)';
  end if;
  -- The same lock the matcher and the staff actions take, so none of them interleaves.
  perform pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0));

  -- Abu Zrayq: which state is production in?
  if exists (select 1 from app_private.football_provider_mappings x where x.provider_name = 'sofascore'
               and x.entity_type = 'player' and x.external_id = '2837528' and x.active)
     and not exists (select 1 from app_private.football_provider_mappings x where x.provider_name = 'sofascore'
               and x.entity_type = 'player' and x.external_id = '986341')
     and not exists (select 1 from app_private.sofascore_player_aliases a where a.sofascore_player_id in ('986341', '2837528')) then
    v_abu := 'moved';
    v_pairs := c_pairs || '[{"who": "Mohammad Abu Zrayq", "main": "2837528", "second": "986341"}]'::jsonb;
  elsif exists (select 1 from app_private.football_provider_mappings x where x.provider_name = 'sofascore'
               and x.entity_type = 'player' and x.external_id = '986341' and x.active)
     and not exists (select 1 from app_private.football_provider_mappings x where x.provider_name = 'sofascore'
               and x.entity_type = 'player' and x.external_id = '2837528')
     and not exists (select 1 from app_private.sofascore_player_aliases a where a.sofascore_player_id in ('986341', '2837528')) then
    v_abu := 'not moved';
    v_pairs := c_pairs || '[{"who": "Mohammad Abu Zrayq", "main": "986341", "second": "2837528"}]'::jsonb;
  else
    raise exception 'GUARD: Abu Zrayq is in neither expected state (one active main link on 2837528 or on 986341, the other id unused)';
  end if;

  select count(*) into v_aliases_before from app_private.sofascore_player_aliases;
  select md5(string_agg(x.id::text || x.external_id || x.internal_entity_id::text || x.active::text, ',' order by x.id))
    into v_main_digest_before
    from app_private.football_provider_mappings x where x.provider_name = 'sofascore' and x.entity_type = 'player';

  -- Every pair is checked before anything is written.
  for r in select * from jsonb_to_recordset(v_pairs) as x(who text, main text, second text) loop
    select * into m from app_private.football_provider_mappings x
     where x.provider_name = 'sofascore' and x.entity_type = 'player' and x.external_id = r.main;
    if not found or not m.active then
      raise exception 'GUARD: % has no active main link on SofaScore id %', r.who, r.main;
    end if;
    v_state := app_private.sofascore_player_identity(r.main);
    if (v_state ->> 'reviewed')::boolean is not true then
      raise exception 'GUARD: the main link % of % is not reviewed (an alias of it would not count either)', r.main, r.who;
    end if;
    if exists (select 1 from app_private.football_provider_mappings x
                where x.provider_name = 'sofascore' and x.entity_type = 'player' and x.external_id = r.second) then
      raise exception 'GUARD: the second id % of % is already a main link of a player', r.second, r.who;
    end if;
    if exists (select 1 from app_private.sofascore_player_aliases a where a.sofascore_player_id = r.second) then
      raise exception 'GUARD: the second id % of % is already attached (this script has run)', r.second, r.who;
    end if;
  end loop;

  for r in select * from jsonb_to_recordset(v_pairs) as x(who text, main text, second text) loop
    select * into m from app_private.football_provider_mappings x
     where x.provider_name = 'sofascore' and x.entity_type = 'player' and x.external_id = r.main;
    v_result := app_private.sofascore_link_alias(r.second, m.internal_entity_id, v_owner,
      jsonb_build_object('source', c_evidence, 'who', r.who, 'abuZrayqState', v_abu));
    if (v_result ->> 'alreadyLinked')::boolean then
      raise exception 'GUARD: % was linked meanwhile', r.second;
    end if;
    -- Read back: the second id is now the same player, active and reviewed.
    v_state := app_private.sofascore_player_identity(r.second);
    if (v_state ->> 'alias')::boolean is not true or (v_state ->> 'active')::boolean is not true
      or (v_state ->> 'reviewed')::boolean is not true
      or v_state ->> 'appPlayerId' is distinct from m.internal_entity_id::text
      or v_state ->> 'primaryExternalId' is distinct from r.main then
      raise exception 'GUARD: % did not read back as an active, reviewed alias of %', r.second, r.main;
    end if;
    v_reopened := v_reopened + (v_result ->> 'reopened')::integer;
    v_closed := v_closed + (v_result ->> 'queueClosed')::integer;
    v_done := v_done || jsonb_build_array(jsonb_build_object('who', r.who, 'main', r.main, 'second', r.second,
      'playerId', m.internal_entity_id, 'listEntryClosed', (v_result ->> 'queueClosed')::integer,
      'reopened', (v_result ->> 'reopened')::integer));
  end loop;

  -- Nothing else moved: five aliases more, and the main links exactly as they were.
  select md5(string_agg(x.id::text || x.external_id || x.internal_entity_id::text || x.active::text, ',' order by x.id))
    into v_main_digest_after
    from app_private.football_provider_mappings x where x.provider_name = 'sofascore' and x.entity_type = 'player';
  if v_main_digest_after is distinct from v_main_digest_before
    or (select count(*) from app_private.sofascore_player_aliases) <> v_aliases_before + jsonb_array_length(v_pairs) then
    raise exception 'GUARD: something other than the five aliases changed';
  end if;

  if not c_commit then
    raise exception 'DRY_RUN_ROLLBACK: would attach % second id(s) (Abu Zrayq: %), close % list entr(y/ies), set held matches to retry % time(s): %. Nothing was written.',
      jsonb_array_length(v_pairs), v_abu, v_closed, v_reopened, v_done;
  end if;
  raise notice 'COMMITTED: % second id(s) attached (Abu Zrayq: %), % list entr(y/ies) closed, held matches set to retry % time(s): %',
    jsonb_array_length(v_pairs), v_abu, v_closed, v_reopened, v_done;
end
$verified_aliases$;
