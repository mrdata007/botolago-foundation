-- Production install of migration 20261014170000_sofascore_catalog_aliases on tkewgajrljbwgwedqsxn
-- (docs/backend/SOFASCORE_PLAYER_MATCHING.md, "Second SofaScore ids" and "What staff can do on the list").
-- It adds second SofaScore ids of a catalog player, makes every SofaScore id -> player reader resolve
-- them, and adds the review list's staff actions (link options, link as second ID, create the player).
-- It writes no data when applied: no mapping, alias, player, membership or pool entry is created,
-- changed or removed here, and no held match is reopened.
-- 1. Merge the reviewed PR; its database-quality job must have passed.
-- 2. Pause and drain every writer with sofascore-rating-release-pause.sql (AGENTS.md "One writer at a
--    time, per database": check first that no agent, workflow or script is writing).
-- 3. Run this script as it is (it ends in rollback): every guard and the whole migration run, then
--    nothing stays. Read the last result rows. Confirm independently that the history row
--    20261014170000 is absent again.
-- 4. Change only the final rollback to commit, run it once, read it back independently, and restore
--    the writers with sofascore-rating-release-resume.sql right away.
-- 5. Then, separately, the one-time alias script attach-sofascore-verified-aliases.sql.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select app_private.hold_scheduled_jobs();
do $preflight$
begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='20261014170000')
    or (select count(*) from supabase_migrations.schema_migrations
         where version in ('20261011130000','20261011180000','20261011191737','20261012120000',
                           '20261013150000','20261014090100')) <> 6 then
    raise exception 'stop: catalog aliases migration already present, or a prerequisite migration is missing';
  end if;
  -- The six functions it replaces are exactly the reviewed versions, and nothing it creates exists yet.
  if
    md5((select prosrc from pg_proc where oid='api.service_sofascore_auto_map_players(uuid,jsonb)'::regprocedure))
       is distinct from 'f73d3f889417c3c664267049976d264e'
    or md5((select prosrc from pg_proc where oid='api.service_sofascore_fantasy_context(uuid,text[])'::regprocedure))
       is distinct from '66386e3d8b4a09fb068da9a014c9acf0'
    or md5((select prosrc from pg_proc where oid='api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)'::regprocedure))
       is distinct from '7176a9d9a55d3dcba00faa95b2fce9dc'
    or md5((select prosrc from pg_proc where oid='app_private.sofascore_sync_fixture_performances(uuid,jsonb)'::regprocedure))
       is distinct from '75877342ab309c5ed0b55d1cc3b8690e'
    or md5((select prosrc from pg_proc where oid='api.admin_sofascore_player_match_queue()'::regprocedure))
       is distinct from '8591b340c16ca4fdbad15a5b241d8e53'
    or md5((select prosrc from pg_proc where oid='api.admin_resolve_sofascore_player_match(text,uuid)'::regprocedure))
       is distinct from '99679746d3c48db7e91022098138807a'
    or to_regprocedure('app_private.sofascore_player_identity(text)') is not null
    or to_regprocedure('app_private.sofascore_player_alias_ids(uuid)') is not null
    or to_regprocedure('app_private.sofascore_create_catalog_player(uuid,uuid,text,integer,text)') is not null
    or to_regprocedure('app_private.sofascore_link_alias(text,uuid,uuid,jsonb)') is not null
    or to_regprocedure('app_private.sofascore_queue_create_season(text)') is not null
    or to_regprocedure('api.admin_sofascore_player_link_options(text,text)') is not null
    or to_regprocedure('api.admin_sofascore_link_alias(text,uuid)') is not null
    or to_regprocedure('api.admin_sofascore_create_player(text,text,integer,text)') is not null
    or to_regclass('app_private.sofascore_player_aliases') is not null then
    raise exception 'stop: the functions this replaces are not the reviewed versions';
  end if;
  if exists(select 1 from cron.job where active)
    or exists(select 1 from cron.job_run_details where status not in ('succeeded','failed'))
    or exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled)
    or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled)
    or exists(select 1 from app_private.manager_card_settings where compute_enabled)
    or exists(select 1 from app_private.pepites_settings where mode<>'off')
    or exists(select 1 from net.http_request_queue)
    or exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and backend_type='client backend' and state='active')
  then raise exception 'stop: production writers are not paused and drained'; end if;
end $preflight$;
create temporary table catalog_aliases_before on commit drop as
  select (select count(*) from app_private.football_provider_mappings where provider_name='sofascore' and entity_type='player') as mappings,
         (select md5(string_agg(m.id::text||m.external_id||m.internal_entity_id::text||m.active::text||coalesce(m.source_version,''), ',' order by m.id))
            from app_private.football_provider_mappings m where m.provider_name='sofascore' and m.entity_type='player') as mapping_digest,
         (select count(*) from app_private.sofascore_player_match_log) as log_rows,
         (select md5(string_agg(q.sofascore_player_id||coalesce(q.resolved_at::text,''), ',' order by q.sofascore_player_id))
            from app_private.sofascore_player_match_queue q) as queue_digest,
         (select count(*) from app.players) as players,
         (select count(*) from app.team_memberships) as memberships,
         (select count(*) from app.fantasy_players) as pool,
         (select md5(string_agg(a.fixture_id::text||a.status||a.attempts::text||coalesce(a.next_retry_at::text,''), ',' order by a.fixture_id))
            from app_private.sofascore_fantasy_attempts a) as attempts_digest;
insert into supabase_migrations.schema_migrations(version,name,statements)
values('20261014170000','sofascore_catalog_aliases',array[$migration$-- SofaScore player catalog: a player may hold more than one SofaScore id, and staff can link any
-- catalog player or create the player from the review list (docs/backend/SOFASCORE_PLAYER_MATCHING.md,
-- "Second SofaScore ids" and "What staff can do on the list").
--
-- WHY. The owner reviewed the list on 2026-10-14. SofaScore sometimes keeps two profiles of one
-- person (Imad Errahouli 919620 and 2033439, Yassine Senhaji 2033440 and 2045584, Ismail Sbahe
-- 2762914 and 2787361, Aymen el Aatga 1866448 and 2790048, Mohammad Abu Zrayq 986341 and 2837528).
-- A catalog player could hold one SofaScore link only (football_provider_mappings_internal_key), so
-- the second id could never be linked and every match it appears in stayed held. About fourteen
-- other entries are players the catalog does not have, or has outside the offered candidates, and
-- the list had no way to create or find them.
--
-- THE MODEL. The main link stays what it is: the one row of app_private.football_provider_mappings
-- per player (its two unique constraints are NOT changed). A second id is a row of the new table
-- app_private.sofascore_player_aliases, pointing at the player. One SofaScore id is either a mapping
-- or an alias, never both, and an alias belongs to one player only: the table's key and two triggers
-- (one on each table, under one advisory lock per id) make that a rule of the database.
--   id -> player   readers that turn a SofaScore id into a player go through
--                  app_private.sofascore_player_identity(id): the mapping's own state
--                  (football_mapping_supporting_state, unchanged) or, for an alias, the player of the
--                  main link, active only while both the alias and the main link are active, and
--                  "reviewed" only while the main link is reviewed AND the alias carries its own proof
--                  (a staff log row 'staff-alias' that agrees with it).
--   player -> id   readers that go from a player to his SofaScore id (the weekly catalog: names,
--                  shirts, photos; the squad link; the admin reads) keep reading the main link only,
--                  so they are not changed.
--
-- WHAT THIS MIGRATION CHANGES.
--   1. app_private.sofascore_player_aliases (new): the second ids. Only `active` may change; a row is
--      never deleted. Row level security forced, no grant.
--   2. Triggers: an alias cannot reuse a mapped id, a mapping cannot reuse an alias's id.
--   3. sofascore_player_match_log: methods also allow 'staff-alias'; a staff method needs decided_by.
--   4. app_private.sofascore_player_identity, sofascore_player_alias_ids (new, internal).
--   5. app_private.sofascore_create_catalog_player (new, internal): the player, his membership for the
--      season and his Fantasy pool entry, taken out of the matcher unchanged (same locks, same price
--      rule, same rows) so the matcher and the staff action create a player the same way.
--   6. app_private.sofascore_link_alias (new, internal): links a second id; used by the staff action
--      and by the owner's one-time script.
--   7. Readers (replaced, signatures and grants unchanged; each body is its previous version plus the
--      alias, nothing else): api.service_sofascore_auto_map_players (an alias is "already linked": never
--      matched, never created again; creation through 5), api.service_sofascore_fantasy_context,
--      api.service_record_sofascore_fantasy_observation, app_private.sofascore_sync_fixture_performances,
--      api.admin_sofascore_player_match_queue (candidates show their second ids; `canCreate`),
--      api.admin_resolve_sofascore_player_match (an alias is a conflict there).
--   8. Staff RPCs (new; football staff, AAL2 through the staff checks):
--        api.admin_sofascore_player_link_options   read: the club's squad, or the catalog by name
--        api.admin_sofascore_link_alias            "link as second ID"
--        api.admin_sofascore_create_player         "create this player from SofaScore"
--      Each write closes the list entry, is logged in sofascore_player_match_log with the staff user,
--      and sets the club's held Fantasy matches to be tried again (app_private.sofascore_fantasy_reopen).
--
-- NOT CHANGED HERE. api.ingest_football_match_details (the live match page's lineups and events) still
-- links only main ids: an alias appears there under its SofaScore name, unlinked, which costs no
-- points. It is replaced by an open pull request (#473); the alias goes into it once that is merged.
--
-- Applying it writes no data: no mapping, alias, player or pool entry is created, changed or removed.
--
-- Prerequisites: 20261011130000, 20261011180000, 20261011191737, 20261012120000, 20261013150000.
do $$
begin
  if to_regclass('app_private.sofascore_player_match_log') is null
    or to_regclass('app_private.sofascore_player_match_queue') is null
    or to_regprocedure('app_private.sofascore_fantasy_reopen(uuid,uuid)') is null
    or to_regprocedure('app_private.sofascore_position_compatible(text,text)') is null
    or to_regprocedure('app_private.sofascore_sync_fixture_performances(uuid,jsonb)') is null
    or to_regprocedure('app_private.fantasy_initial_price_v1(text,numeric,numeric)') is null then
    raise exception 'sofascore_catalog_aliases: a prerequisite migration is missing';
  end if;
end
$$;

-- ===========================================================================
-- 1. Second SofaScore ids
-- ===========================================================================
create table app_private.sofascore_player_aliases (
  id uuid primary key default gen_random_uuid(),
  sofascore_player_id text not null,
  player_id uuid not null references app.players(id) on delete restrict,
  -- The staff decision that made it (method 'staff-alias', with decided_by): its review proof.
  log_id uuid not null references app_private.sofascore_player_match_log(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint sofascore_player_aliases_external_key unique (sofascore_player_id),
  constraint sofascore_player_aliases_log_key unique (log_id),
  constraint sofascore_player_aliases_external_check check (
    sofascore_player_id = btrim(sofascore_player_id) and char_length(sofascore_player_id) between 1 and 200)
);
create index sofascore_player_aliases_player_idx on app_private.sofascore_player_aliases (player_id);
alter table app_private.sofascore_player_aliases enable row level security;
alter table app_private.sofascore_player_aliases force row level security;
revoke all on table app_private.sofascore_player_aliases from public, anon, authenticated, service_role;
comment on table app_private.sofascore_player_aliases is
  'Second SofaScore player ids of a catalog player (SofaScore keeps two profiles of one person). The main id is the player''s football_provider_mappings row; an id is a mapping or an alias, never both.';

-- ===========================================================================
-- 2. One id, one place
-- ===========================================================================
create function app_private.sofascore_player_alias_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'PT409', message = 'sofascore_alias_immutable'; end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.sofascore_player_id is distinct from old.sofascore_player_id
      or new.player_id is distinct from old.player_id or new.log_id is distinct from old.log_id
      or new.created_at is distinct from old.created_at then
      raise exception using errcode = 'PT409', message = 'sofascore_alias_immutable'; end if;
    new.updated_at := statement_timestamp();
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sofascore-player-id:' || new.sofascore_player_id, 0));
  if exists (select 1 from app_private.football_provider_mappings m
              where m.provider_name = 'sofascore' and m.entity_type = 'player'
                and m.external_id = new.sofascore_player_id) then
    raise exception using errcode = 'PT409', message = 'sofascore_alias_conflict',
      detail = 'sofascore:' || new.sofascore_player_id; end if;
  return new;
end $$;
revoke all on function app_private.sofascore_player_alias_guard() from public, anon, authenticated, service_role;
create trigger sofascore_player_aliases_guard
before insert or update or delete on app_private.sofascore_player_aliases
for each row execute function app_private.sofascore_player_alias_guard();

create function app_private.sofascore_player_mapping_alias_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('sofascore-player-id:' || new.external_id, 0));
  if exists (select 1 from app_private.sofascore_player_aliases a
              where a.sofascore_player_id = new.external_id) then
    raise exception using errcode = 'PT409', message = 'sofascore_alias_conflict',
      detail = 'sofascore:' || new.external_id; end if;
  return new;
end $$;
revoke all on function app_private.sofascore_player_mapping_alias_guard() from public, anon, authenticated, service_role;
create trigger football_provider_mappings_sofascore_alias_guard
before insert or update of provider_name, entity_type, external_id on app_private.football_provider_mappings
for each row
when (new.provider_name = 'sofascore' and new.entity_type = 'player')
execute function app_private.sofascore_player_mapping_alias_guard();

-- ===========================================================================
-- 3. The log knows the staff alias
-- ===========================================================================
alter table app_private.sofascore_player_match_log drop constraint sofascore_player_match_log_method_check;
alter table app_private.sofascore_player_match_log add constraint sofascore_player_match_log_method_check
  check (method in ('exact-name', 'name-and-shirt', 'staff-resolution', 'side-shirt-position',
                    'sofascore-created', 'staff-alias'));
alter table app_private.sofascore_player_match_log drop constraint sofascore_player_match_log_staff_check;
alter table app_private.sofascore_player_match_log add constraint sofascore_player_match_log_staff_check
  check ((method in ('staff-resolution', 'staff-alias')) = (decided_by is not null));

-- ===========================================================================
-- 4. id -> player, for every reader
-- ===========================================================================
-- The state of one SofaScore player id: its own mapping (football_mapping_supporting_state, as the
-- readers used before, plus alias = false), or, for a second id, the player of the main link with:
--   active    = the alias is active AND the main link is active and still points at that player;
--   reviewed  = the main link is reviewed AND the alias's log row agrees with it (method 'staff-alias',
--               same SofaScore id, same player, a staff user);
--   mappingId = the main link's id (its provenance); aliasRowId = the alias row; sourceVersion =
--               'sofascore-alias:<log id>'.
-- Null when the id is neither.
create function app_private.sofascore_player_identity(p_external_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_mapping uuid;
  a app_private.sofascore_player_aliases%rowtype;
  l app_private.sofascore_player_match_log%rowtype;
  v_main jsonb;
  v_proof boolean := false;
begin
  if p_external_id is null then return null; end if;
  select m.id into v_mapping from app_private.football_provider_mappings m
   where m.provider_name = 'sofascore' and m.entity_type = 'player' and m.external_id = p_external_id;
  if found then
    return app_private.football_mapping_supporting_state(v_mapping) || jsonb_build_object('alias', false);
  end if;
  select * into a from app_private.sofascore_player_aliases where sofascore_player_id = p_external_id;
  if not found then return null; end if;
  select m.id into v_mapping from app_private.football_provider_mappings m
   where m.provider_name = 'sofascore' and m.entity_type = 'player' and m.internal_entity_id = a.player_id;
  v_main := case when v_mapping is null then null else app_private.football_mapping_supporting_state(v_mapping) end;
  select * into l from app_private.sofascore_player_match_log where id = a.log_id;
  if found then
    v_proof := l.method = 'staff-alias' and l.decided_by is not null
      and l.sofascore_player_id = a.sofascore_player_id and l.player_id = a.player_id;
  end if;
  return jsonb_build_object(
    'alias', true,
    'aliasRowId', a.id,
    'mappingId', v_main -> 'mappingId',
    'provider', 'sofascore',
    'entityType', 'player',
    'externalId', a.sofascore_player_id,
    'primaryExternalId', v_main -> 'externalId',
    'appPlayerId', a.player_id,
    'active', a.active and coalesce((v_main ->> 'active')::boolean, false)
      and lower(v_main ->> 'appPlayerId') = lower(a.player_id::text),
    'reviewed', v_proof and coalesce((v_main ->> 'reviewed')::boolean, false),
    'reviewProvenance', case when v_proof then 'staff_alias' else 'none' end,
    'primaryReviewProvenance', v_main -> 'reviewProvenance',
    'sourceVersion', 'sofascore-alias:' || a.log_id::text,
    'updatedAt', greatest(a.updated_at, (v_main ->> 'updatedAt')::timestamptz));
end $$;
revoke all on function app_private.sofascore_player_identity(text) from public, anon, authenticated, service_role;

create function app_private.sofascore_player_alias_ids(p_player_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(a.sofascore_player_id order by a.created_at, a.sofascore_player_id), '[]'::jsonb)
    from app_private.sofascore_player_aliases a
   where a.player_id = p_player_id and a.active;
$$;
revoke all on function app_private.sofascore_player_alias_ids(uuid) from public, anon, authenticated, service_role;

-- ===========================================================================
-- 5. Creating a catalog player (the matcher's own steps, now shared)
-- ===========================================================================
-- Byte for byte what api.service_sofascore_auto_map_players of 20261013150000 did inline, given the
-- fixture's season, the club, the SofaScore name, shirt and position: the Fantasy catalog locks, the
-- player, a season-long membership (shirt left blank if an active member of the club wears it), and,
-- when the season has a Fantasy season, the pool entry priced by fantasy_initial_price_v1 at rating
-- 6.0 and confidence 0 with its evidence and price-history rows. It checks what its callers checked
-- (current season, a position, a name of 2 to 200 characters) and refuses otherwise.
create function app_private.sofascore_create_catalog_player(
  p_season_id uuid, p_team_id uuid, p_name text, p_shirt integer, p_position text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s app.seasons%rowtype;
  fs app.fantasy_seasons%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_new uuid;
  v_new_fantasy uuid;
  v_membership_shirt integer;
  v_pos_code text;
  v_price numeric;
begin
  select * into s from app.seasons where id = p_season_id;
  if not found or not s.is_current then
    raise exception using errcode = 'PT409', message = 'sofascore_create_season_not_current'; end if;
  if p_team_id is null or not exists (select 1 from app.teams where id = p_team_id) then
    raise exception using errcode = 'PT400', message = 'sofascore_create_no_club'; end if;
  if p_position is null or p_position not in ('goalkeeper', 'defender', 'midfielder', 'forward') then
    raise exception using errcode = 'PT400', message = 'sofascore_create_position_required'; end if;
  if char_length(v_name) not between 2 and 200 then
    raise exception using errcode = 'PT400', message = 'sofascore_create_name_invalid'; end if;
  if p_shirt is not null and p_shirt not between 0 and 99 then
    raise exception using errcode = 'PT400', message = 'sofascore_create_shirt_invalid'; end if;
  select * into fs from app.fantasy_seasons where football_season_id = s.id;

  perform pg_advisory_xact_lock(hashtextextended('fantasy:catalog:' || s.id::text, 0));
  if fs.id is not null then
    perform pg_advisory_xact_lock_shared(hashtextextended('fantasy:squads:' || fs.id::text, 0));
  end if;
  v_new := gen_random_uuid();
  insert into app.players (id, slug, full_name, display_name, position, preferred_foot, active)
  values (v_new, app_private.football_catalog_slug('player', left(v_name, 120), v_new),
    v_name, left(v_name, 120), p_position::app.football_position, 'unknown', true);
  -- A shirt number another active member of the club already wears is left blank, as the
  -- player-list update does (the club may have a stale member; staff can correct it).
  v_membership_shirt := p_shirt;
  if exists (select 1 from app.team_memberships mem
              where mem.team_id = p_team_id and mem.season_id = s.id and mem.active
                and mem.shirt_number = p_shirt) then
    v_membership_shirt := null;
  end if;
  insert into app.team_memberships (player_id, team_id, season_id, shirt_number, squad_role,
    valid_from, valid_to, active)
  values (v_new, p_team_id, s.id, v_membership_shirt, 'player', s.starts_on, s.ends_on, true);
  if fs.id is not null then
    v_pos_code := case p_position when 'goalkeeper' then 'GK' when 'defender' then 'DEF'
                                  when 'midfielder' then 'MID' else 'FWD' end;
    -- No earlier rating: the opening catalog and the player-list update price this the same way.
    v_price := round(app_private.fantasy_initial_price_v1(v_pos_code, 6.0, 0.0), 1);
    insert into app.fantasy_players (fantasy_season_id, football_player_id, football_team_id,
      position_id, price, status, eligible, active)
    values (fs.id, v_new, p_team_id,
      (select fp.id from app.fantasy_positions fp where fp.code = v_pos_code),
      v_price, 'available', true, true)
    returning id into v_new_fantasy;
    insert into app_private.fantasy_initial_price_evidence (
      fantasy_player_id, algorithm_code, source_rating_season_id, source_rating_algorithm,
      source_rating, source_confidence, calculated_price)
    values (v_new_fantasy, 'botolago-initial-price-v1.0', null, null, 6.0, 0.0, v_price);
    insert into app.fantasy_player_price_history (fantasy_player_id, gameweek_id, old_price,
      new_price, reason, effective_at, source_version, movement)
    values (v_new_fantasy, null, null, v_price, 'sofascore_player_created_v1',
      statement_timestamp(), 1, 0);
  end if;
  return jsonb_build_object('playerId', v_new, 'seasonId', s.id, 'teamId', p_team_id,
    'membershipShirt', v_membership_shirt, 'position', p_position,
    'fantasySeasonId', fs.id, 'fantasyPlayerId', v_new_fantasy, 'price', v_price);
end $$;
revoke all on function app_private.sofascore_create_catalog_player(uuid, uuid, text, integer, text)
  from public, anon, authenticated, service_role;

-- ===========================================================================
-- 6. Linking a second id
-- ===========================================================================
-- Links p_sofascore_player_id to p_player_id as a second id, decided by p_decided_by (a staff auth
-- user). The player must hold an active main link; the id must be neither a mapping nor another
-- player's alias. Already linked to this very player: nothing changes (alreadyLinked). Closes the
-- open list entry, and sets the held Fantasy matches of the entry's club and of the player's current
-- clubs to be tried again. Serialised with the matcher by its advisory lock.
create function app_private.sofascore_link_alias(
  p_sofascore_player_id text, p_player_id uuid, p_decided_by uuid, p_evidence jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  q app_private.sofascore_player_match_queue%rowtype;
  a app_private.sofascore_player_aliases%rowtype;
  m app_private.football_provider_mappings%rowtype;
  v_log uuid := gen_random_uuid();
  v_alias uuid;
  v_teams uuid[];
  v_team uuid;
  v_closed integer := 0;
  v_reopened integer := 0;
begin
  if p_sofascore_player_id is null or p_player_id is null or p_decided_by is null
    or p_sofascore_player_id <> btrim(p_sofascore_player_id)
    or char_length(p_sofascore_player_id) not between 1 and 200
    or jsonb_typeof(coalesce(p_evidence, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = 'PT400', message = 'invalid_resolution'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0));

  select * into a from app_private.sofascore_player_aliases where sofascore_player_id = p_sofascore_player_id;
  if found then
    if a.player_id = p_player_id and a.active then
      return jsonb_build_object('sofascorePlayerId', p_sofascore_player_id, 'playerId', p_player_id,
        'aliasId', a.id, 'alreadyLinked', true, 'reopened', 0, 'queueClosed', 0);
    end if;
    raise exception using errcode = 'PT409', message = 'sofascore_mapping_conflict'; end if;
  if exists (select 1 from app_private.football_provider_mappings x
              where x.provider_name = 'sofascore' and x.entity_type = 'player'
                and x.external_id = p_sofascore_player_id) then
    raise exception using errcode = 'PT409', message = 'sofascore_mapping_conflict'; end if;
  if not exists (select 1 from app.players where id = p_player_id) then
    raise exception using errcode = 'PT404', message = 'player_not_found'; end if;
  select * into m from app_private.football_provider_mappings x
   where x.provider_name = 'sofascore' and x.entity_type = 'player' and x.internal_entity_id = p_player_id;
  if not found or not m.active then
    raise exception using errcode = 'PT409', message = 'sofascore_alias_needs_primary'; end if;

  select * into q from app_private.sofascore_player_match_queue
   where sofascore_player_id = p_sofascore_player_id for update;

  insert into app_private.sofascore_player_match_log (id, method, mapping_id, sofascore_player_id,
    player_id, fixture_id, evidence, decided_by)
  values (v_log, 'staff-alias', m.id, p_sofascore_player_id, p_player_id, q.fixture_id,
    coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object('action', 'alias',
      'primarySofascoreId', m.external_id, 'sofascoreName', q.name, 'queueReason', q.reason),
    p_decided_by);
  insert into app_private.sofascore_player_aliases (sofascore_player_id, player_id, log_id)
  values (p_sofascore_player_id, p_player_id, v_log)
  returning id into v_alias;

  update app_private.sofascore_player_match_queue
     set resolved_at = statement_timestamp(), resolved_by = p_decided_by, resolved_player_id = p_player_id
   where sofascore_player_id = p_sofascore_player_id and resolved_at is null;
  get diagnostics v_closed = row_count;

  select coalesce(array_agg(distinct t), '{}') into v_teams
    from (select q.team_id as t
          union all
          select mem.team_id from app.team_memberships mem
            join app.seasons s on s.id = mem.season_id and s.is_current
           where mem.player_id = p_player_id and mem.active) x
   where t is not null;
  foreach v_team in array v_teams loop
    v_reopened := v_reopened + app_private.sofascore_fantasy_reopen(v_team, null);
  end loop;
  return jsonb_build_object('sofascorePlayerId', p_sofascore_player_id, 'playerId', p_player_id,
    'aliasId', v_alias, 'logId', v_log, 'primarySofascoreId', m.external_id,
    'alreadyLinked', false, 'reopened', v_reopened, 'queueClosed', v_closed);
end $$;
revoke all on function app_private.sofascore_link_alias(text, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- The season a staff-created player joins, for one list entry: the season of the match he was seen
-- in, if it is the current one; for an entry with no match (the squad link), the one current season
-- in which his club has members. Null when there is none (or no club).
create function app_private.sofascore_queue_create_season(p_sofascore_player_id text)
returns uuid language sql stable security definer set search_path = '' as $$
  select case
    when q.team_id is null then null
    when q.fixture_id is not null then
      (select s.id from app.fixtures f join app.seasons s on s.id = f.season_id and s.is_current
        where f.id = q.fixture_id)
    else
      (select case when count(distinct s.id) = 1 then min(s.id::text)::uuid end
         from app.team_memberships mem join app.seasons s on s.id = mem.season_id and s.is_current
        where mem.team_id = q.team_id)
  end
  from app_private.sofascore_player_match_queue q
  where q.sofascore_player_id = p_sofascore_player_id;
$$;
revoke all on function app_private.sofascore_queue_create_season(text) from public, anon, authenticated, service_role;

-- ===========================================================================
-- 7. The readers: each is its previous version with the alias added, nothing else
-- ===========================================================================
-- The matcher (20261013150000): an alias is "already linked" (pass 1 and pass 2), and the creation
-- of a player goes through section 5.
create or replace function api.service_sofascore_auto_map_players(p_fixture_id uuid, p_players jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f app.fixtures%rowtype;
  s app.seasons%rowtype;
  fs app.fantasy_seasons%rowtype;
  p jsonb;
  v_id text; v_side text; v_name text; v_short text; v_pos text;
  v_shirt integer; v_appeared boolean; v_team uuid;
  v_existing app_private.football_provider_mappings%rowtype;
  v_alias app_private.sofascore_player_aliases%rowtype; v_state jsonb; v_creation jsonb;
  v_cands uuid[]; v_other uuid[]; v_nullshirt uuid[];
  v_pick uuid; v_method text; v_reason text; v_conflict boolean;
  v_log uuid; v_mapping uuid; v_new uuid;
  v_claims text[] := '{}';
  v_membership_shirt integer;
  v_mapped jsonb := '[]'::jsonb; v_queued integer := 0; v_conflicts integer := 0;
  v_created integer := 0; v_create_failed integer := 0;
  v_linked_home boolean := false; v_linked_away boolean := false;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_fixture_id is null or jsonb_typeof(p_players) is distinct from 'array'
    or jsonb_array_length(p_players) > 200 then
    raise exception using errcode = 'PT400', message = 'sofascore_auto_map_invalid'; end if;
  for p in select value from jsonb_array_elements(p_players) loop
    if jsonb_typeof(p) is distinct from 'object'
      or jsonb_typeof(p -> 'sofascorePlayerId') is distinct from 'string'
      or coalesce(p ->> 'sofascorePlayerId', '') !~ '^[^[:space:]]{1,200}$'
      or p ->> 'side' is null or p ->> 'side' not in ('home', 'away')
      or jsonb_typeof(p -> 'name') is distinct from 'string' or btrim(p ->> 'name') = ''
      or char_length(p ->> 'name') > 200
      or (p ? 'shirtNumber' and jsonb_typeof(p -> 'shirtNumber') not in ('number', 'null'))
      or (p ? 'position' and jsonb_typeof(p -> 'position') not in ('string', 'null'))
      or (p ? 'appeared' and jsonb_typeof(p -> 'appeared') not in ('boolean', 'null'))
      or (p ? 'shortName' and jsonb_typeof(p -> 'shortName') not in ('string', 'null')) then
      raise exception using errcode = 'PT400', message = 'sofascore_auto_map_invalid'; end if;
  end loop;

  select * into f from app.fixtures where id = p_fixture_id;
  if not found then raise exception using errcode = 'PT404', message = 'sofascore_fixture_not_found'; end if;
  select * into s from app.seasons where id = f.season_id;
  select * into fs from app.fantasy_seasons where football_season_id = f.season_id;

  -- One matcher at a time: two calls for the same players cannot interleave.
  perform pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0));

  -- Pass 1: which unmapped player has exactly one candidate? Two SofaScore ids pointing at one
  -- candidate in this very call are a conflict for both, whichever comes first in the list.
  for p in select value from jsonb_array_elements(p_players) loop
    v_id := p ->> 'sofascorePlayerId';
    v_shirt := case when jsonb_typeof(p -> 'shirtNumber') = 'number'
                     and (p ->> 'shirtNumber') ~ '^[0-9]{1,2}$' then (p ->> 'shirtNumber')::integer end;
    v_pos := case p ->> 'position' when 'G' then 'goalkeeper' when 'D' then 'defender'
                                   when 'M' then 'midfielder' when 'F' then 'forward' end;
    v_team := case p ->> 'side' when 'home' then f.home_team_id else f.away_team_id end;
    continue when v_shirt is null;
    continue when exists (select 1 from app_private.football_provider_mappings m
                           where m.provider_name = 'sofascore' and m.entity_type = 'player' and m.external_id = v_id)
               or exists (select 1 from app_private.sofascore_player_aliases al where al.sofascore_player_id = v_id);
    select coalesce(array_agg(distinct pl.id), '{}') into v_cands
      from app.team_memberships mem
      join app.players pl on pl.id = mem.player_id
     where mem.team_id = v_team and mem.season_id = f.season_id and mem.active
       and mem.valid_from <= f.kickoff_at::date
       and (mem.valid_to is null or mem.valid_to >= f.kickoff_at::date)
       and mem.shirt_number = v_shirt
       and app_private.sofascore_position_compatible(pl.position::text, v_pos)
       and not exists (select 1 from app_private.football_provider_mappings m
                        where m.provider_name = 'sofascore' and m.entity_type = 'player'
                          and m.internal_entity_id = pl.id and m.active);
    if cardinality(v_cands) = 1 then
      v_claims := v_claims || (v_id || '|' || v_cands[1]::text);
    end if;
  end loop;

  -- Pass 2: decide.
  for p in select value from jsonb_array_elements(p_players) loop
    v_id := p ->> 'sofascorePlayerId';
    v_side := p ->> 'side';
    v_name := btrim(p ->> 'name');      -- display and the new player's name only; never compared
    v_short := nullif(btrim(coalesce(p ->> 'shortName', '')), '');
    v_shirt := case when jsonb_typeof(p -> 'shirtNumber') = 'number'
                     and (p ->> 'shirtNumber') ~ '^[0-9]{1,2}$' then (p ->> 'shirtNumber')::integer end;
    v_pos := case p ->> 'position' when 'G' then 'goalkeeper' when 'D' then 'defender'
                                   when 'M' then 'midfielder' when 'F' then 'forward' end;
    v_appeared := coalesce((p ->> 'appeared')::boolean, false);
    v_team := case v_side when 'home' then f.home_team_id else f.away_team_id end;

    -- Already mapped: returned as it is. Never overwritten, never deactivated.
    select * into v_existing from app_private.football_provider_mappings
     where provider_name = 'sofascore' and entity_type = 'player' and external_id = v_id;
    if found then
      if v_existing.active then
        update app_private.sofascore_player_match_queue
           set resolved_at = statement_timestamp(), resolved_player_id = v_existing.internal_entity_id
         where sofascore_player_id = v_id and resolved_at is null;
        v_mapped := v_mapped || jsonb_build_array(jsonb_build_object(
          'sofascorePlayerId', v_id, 'playerId', v_existing.internal_entity_id));
      elsif v_appeared then
        perform app_private.sofascore_player_match_enqueue(v_id, f.id, v_team, v_side, v_name, v_short,
          v_shirt, v_pos, 'inactive_mapping_exists', array[v_existing.internal_entity_id]);
        v_queued := v_queued + 1; v_conflicts := v_conflicts + 1;
      end if;
      continue;
    end if;

    -- A second SofaScore id of a catalog player (20261014170000): the same as a mapping that exists.
    -- He is that player while the alias and the player's main link are active; he is never matched
    -- again, never created again, and his alias is never changed here.
    select * into v_alias from app_private.sofascore_player_aliases where sofascore_player_id = v_id;
    if found then
      v_state := app_private.sofascore_player_identity(v_id);
      if coalesce((v_state ->> 'active')::boolean, false) then
        update app_private.sofascore_player_match_queue
           set resolved_at = statement_timestamp(), resolved_player_id = v_alias.player_id
         where sofascore_player_id = v_id and resolved_at is null;
        v_mapped := v_mapped || jsonb_build_array(jsonb_build_object(
          'sofascorePlayerId', v_id, 'playerId', v_alias.player_id));
      elsif v_appeared then
        perform app_private.sofascore_player_match_enqueue(v_id, f.id, v_team, v_side, v_name, v_short,
          v_shirt, v_pos, 'inactive_mapping_exists', array[v_alias.player_id]);
        v_queued := v_queued + 1; v_conflicts := v_conflicts + 1;
      end if;
      continue;
    end if;

    v_cands := '{}'; v_other := '{}'; v_nullshirt := '{}';
    v_pick := null; v_method := null; v_reason := null; v_conflict := false; v_new := null;
    if v_shirt is null then
      v_reason := 'no_shirt';
    else
      -- This club's squad on match day without an active SofaScore mapping: those with this shirt
      -- number at a compatible position (candidates), at an incompatible one, and those with no
      -- shirt number on file at a compatible position (who could be anyone).
      select coalesce(array_agg(distinct pl.id) filter (where mem.shirt_number = v_shirt
               and app_private.sofascore_position_compatible(pl.position::text, v_pos)), '{}'),
             coalesce(array_agg(distinct pl.id) filter (where mem.shirt_number = v_shirt
               and not app_private.sofascore_position_compatible(pl.position::text, v_pos)), '{}'),
             coalesce(array_agg(distinct pl.id) filter (where mem.shirt_number is null
               and app_private.sofascore_position_compatible(pl.position::text, v_pos)), '{}')
        into v_cands, v_other, v_nullshirt
        from app.team_memberships mem
        join app.players pl on pl.id = mem.player_id
       where mem.team_id = v_team and mem.season_id = f.season_id and mem.active
         and mem.valid_from <= f.kickoff_at::date
         and (mem.valid_to is null or mem.valid_to >= f.kickoff_at::date)
         and (mem.shirt_number = v_shirt or mem.shirt_number is null)
         and not exists (select 1 from app_private.football_provider_mappings m
                          where m.provider_name = 'sofascore' and m.entity_type = 'player'
                            and m.internal_entity_id = pl.id and m.active);
      if cardinality(v_cands) > 1 then
        v_reason := 'ambiguous_shirt';
      elsif cardinality(v_cands) = 1 then
        if (select count(distinct split_part(c, '|', 1)) from unnest(v_claims) c
             where split_part(c, '|', 2) = v_cands[1]::text) > 1 then
          v_reason := 'shirt_conflict'; v_conflict := true;
        else
          v_pick := v_cands[1]; v_method := 'side-shirt-position';
        end if;
      elsif cardinality(v_other) > 0 then
        v_reason := 'position_mismatch'; v_cands := v_other;
      elsif cardinality(v_nullshirt) > 0 then
        v_reason := 'no_shirt_on_file'; v_cands := v_nullshirt;
      else
        v_reason := 'no_candidate';
      end if;
    end if;

    -- The chosen player must not already carry another SofaScore id (an inactive one included).
    if v_pick is not null and exists (
         select 1 from app_private.football_provider_mappings m
          where m.provider_name = 'sofascore' and m.entity_type = 'player' and m.internal_entity_id = v_pick) then
      v_reason := 'candidate_already_mapped'; v_cands := array[v_pick]; v_pick := null; v_conflict := true;
    end if;

    -- Nobody in the catalog: create him (only a player who appeared, in the current season, with a
    -- position and a usable name). A failure rolls the creation back and leaves him queued.
    if v_pick is null and v_reason = 'no_candidate' and v_appeared and v_pos is not null
       and s.is_current and char_length(v_name) between 2 and 200 then
      begin
        -- The player, his membership and his Fantasy pool entry: one function, shared with the staff
        -- action "create this player" (20261014170000), with the same locks and price as before.
        v_creation := app_private.sofascore_create_catalog_player(f.season_id, v_team, v_name, v_shirt, v_pos);
        v_new := (v_creation ->> 'playerId')::uuid;
        v_membership_shirt := (v_creation ->> 'membershipShirt')::integer;
        v_log := gen_random_uuid(); v_mapping := null;
        insert into app_private.football_provider_mappings (
          provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at,
          active, manually_corrected)
        values ('sofascore', 'player', v_id, v_new,
          'sofascore-auto-map:sofascore-created:' || v_log::text, statement_timestamp(), true, false)
        returning id into v_mapping;
        insert into app_private.sofascore_player_match_log (id, method, mapping_id, sofascore_player_id,
          player_id, fixture_id, evidence)
        values (v_log, 'sofascore-created', v_mapping, v_id, v_new, f.id, jsonb_build_object(
          'sofascoreName', v_name, 'shirtNumber', v_shirt, 'membershipShirt', v_membership_shirt,
          'position', v_pos, 'side', v_side, 'teamId', v_team, 'fantasySeasonId', fs.id));
        update app_private.sofascore_player_match_queue
           set resolved_at = statement_timestamp(), resolved_player_id = v_new
         where sofascore_player_id = v_id and resolved_at is null;
        v_mapped := v_mapped || jsonb_build_array(jsonb_build_object('sofascorePlayerId', v_id, 'playerId', v_new));
        v_created := v_created + 1;
        if v_side = 'home' then v_linked_home := true; else v_linked_away := true; end if;
        continue;
      exception when others then
        -- Everything the block did is rolled back; he stays unmapped and queued.
        v_create_failed := v_create_failed + 1;
        v_new := null;
      end;
    end if;

    if v_pick is not null then
      v_log := gen_random_uuid(); v_mapping := null;
      insert into app_private.football_provider_mappings (
        provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at,
        active, manually_corrected)
      values ('sofascore', 'player', v_id, v_pick,
        'sofascore-auto-map:side-shirt-position:' || v_log::text, statement_timestamp(), true, false)
      on conflict do nothing
      returning id into v_mapping;
      if v_mapping is not null then
        insert into app_private.sofascore_player_match_log (id, method, mapping_id, sofascore_player_id,
          player_id, fixture_id, evidence)
        values (v_log, 'side-shirt-position', v_mapping, v_id, v_pick, f.id, jsonb_build_object(
          'sofascoreName', v_name, 'shirtNumber', v_shirt, 'position', v_pos, 'side', v_side, 'teamId', v_team));
        v_mapped := v_mapped || jsonb_build_array(jsonb_build_object('sofascorePlayerId', v_id, 'playerId', v_pick));
        update app_private.sofascore_player_match_queue
           set resolved_at = statement_timestamp(), resolved_player_id = v_pick
         where sofascore_player_id = v_id and resolved_at is null;
        if v_side = 'home' then v_linked_home := true; else v_linked_away := true; end if;
        continue;
      end if;
      -- Lost a race (or a row appeared meanwhile): report what is there, change nothing.
      select * into v_existing from app_private.football_provider_mappings
       where provider_name = 'sofascore' and entity_type = 'player' and external_id = v_id and active;
      if found then
        v_mapped := v_mapped || jsonb_build_array(jsonb_build_object(
          'sofascorePlayerId', v_id, 'playerId', v_existing.internal_entity_id));
        continue;
      end if;
      v_reason := 'candidate_already_mapped'; v_cands := array[v_pick]; v_conflict := true;
    end if;

    if v_appeared then
      perform app_private.sofascore_player_match_enqueue(v_id, f.id, v_team, v_side, v_name, v_short,
        v_shirt, v_pos, v_reason, v_cands);
      v_queued := v_queued + 1;
      if v_conflict then v_conflicts := v_conflicts + 1; end if;
    end if;
  end loop;

  -- A club that gained a player this call: its finished matches that wait on a player identity are
  -- tried again on the next tick, as when staff match a player (20261012120000).
  if v_linked_home then perform app_private.sofascore_fantasy_reopen(f.home_team_id, null); end if;
  if v_linked_away then perform app_private.sofascore_fantasy_reopen(f.away_team_id, null); end if;

  return jsonb_build_object('mapped', v_mapped, 'queued', v_queued, 'conflicts', v_conflicts,
    'created', v_created, 'createFailed', v_create_failed);
end $$;

-- The Fantasy context (20261011191737): each asked id, mapping or alias, through the identity above.
create or replace function api.service_sofascore_fantasy_context(
  p_fixture_id uuid, p_player_ids text[] default '{}'::text[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  f app.fixtures%rowtype;
  gw app.fantasy_gameweeks%rowtype;
  a app_private.sofascore_fantasy_attempts%rowtype;
  v_event text;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden'; end if;
  if p_fixture_id is null or p_player_ids is null or cardinality(p_player_ids) > 120 then
    raise exception using errcode = 'PT400', message = 'sofascore_fantasy_context_invalid'; end if;
  select * into f from app.fixtures where id = p_fixture_id;
  if not found then return jsonb_build_object('found', false); end if;
  select m.external_id into v_event from app_private.football_provider_mappings m
   where m.provider_name = 'sofascore' and m.entity_type = 'fixture'
     and m.internal_entity_id = f.id and m.active limit 1;
  select g.* into gw from app.fantasy_fixture_assignments x
    join app.fantasy_gameweeks g on g.id = x.gameweek_id
   where x.fixture_id = f.id and x.superseded_at is null limit 1;
  select * into a from app_private.sofascore_fantasy_attempts where fixture_id = f.id;
  return jsonb_build_object(
    'found', true,
    'sofascoreEventId', v_event,
    'status', f.status::text,
    'finalized', f.finalized_at is not null,
    'homeScore', f.home_score, 'awayScore', f.away_score,
    'homeTeamId', f.home_team_id, 'awayTeamId', f.away_team_id,
    'gameweekStatus', gw.status::text,
    'adaptiveEnabled', gw.id is not null and app_private.fantasy_adaptive_enabled(gw.id),
    'observations', (select count(*) from app_private.fantasy_fixture_observations o where o.fixture_id = f.id),
    'attempt', case when a.fixture_id is null then null else jsonb_build_object(
      'status', a.status, 'attempts', a.attempts, 'nextRetryAt', a.next_retry_at,
      'lastOutcome', a.last_outcome, 'dataDigest', a.data_digest,
      'matchData', a.match_data) end,
    -- Each asked id that is linked: by its own mapping, or as a second SofaScore id of a player
    -- (20261014170000), which answers with the player of the main link and its own row and proof.
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', coalesce(s.state ->> 'aliasRowId', s.state ->> 'mappingId'), 'externalId', s.external_id,
        'appPlayerId', s.state ->> 'appPlayerId',
        'active', coalesce((s.state ->> 'active')::boolean, false),
        'reviewed', coalesce((s.state ->> 'reviewed')::boolean, false),
        'version', s.state ->> 'sourceVersion',
        'updatedAt', s.state -> 'updatedAt') order by s.external_id), '[]'::jsonb)
      from (select x.external_id, app_private.sofascore_player_identity(x.external_id) as state
              from (select distinct unnest(p_player_ids) as external_id) x) s
      where s.state is not null and s.state ->> 'appPlayerId' is not null));
end $$;

-- The Fantasy observation recorder (20261012120000): the identity check reads the identity above, and
-- an alias is never an "unmapped substitute".
create or replace function api.service_record_sofascore_fantasy_observation(
  p_fixture_id uuid, p_request jsonb, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  payload jsonb := p_request->'payload';
  f app.fixtures%rowtype;
  player jsonb; v_external text; v_state jsonb; v_event text;
  link_fixture uuid; before_count bigint; result jsonb; latest bigint;
  v_rows jsonb; v_absent jsonb; v_coverage text := p_request->>'coverage';
  e record; x jsonb; v_except boolean; v_excl_team uuid; v_excl_pos text; v_excl_shirt integer; v_excluded integer := 0;
  v_anon_home integer := 0; v_anon_away integer := 0; v_anon_expected jsonb; v_home_goals integer; v_away_goals integer;
begin
  if not app_private.is_service_request() then
    raise exception using errcode='PT403', message='forbidden'; end if;
  if p_fixture_id is null or p_dry_run is null or jsonb_typeof(p_request) is distinct from 'object'
    or jsonb_typeof(payload) is distinct from 'object'
    or jsonb_typeof(payload->'players') is distinct from 'array'
    or coalesce(p_request->>'sofascoreEventId', '') !~ '^[0-9]{1,20}$'
    or coalesce(p_request->>'mappingSnapshotDigest', '') !~ '^[0-9a-f]{64}$'
    or v_coverage is null or v_coverage not in ('full', 'limited')
    or not coalesce(
      -- Either every appearing player has a row (squadComplete) ...
      (coalesce((payload->>'squadComplete')::boolean, false) is true
        and not (payload ? 'squadCompleteExceptExcluded') and not (payload ? 'excludedUnmappedPlayers'))
      -- ... or every one has a row except the unmapped substitutes listed, which are checked below.
      or (coalesce((payload->>'squadCompleteExceptExcluded')::boolean, false) is true
        and not (payload ? 'squadComplete')
        and case when jsonb_typeof(payload->'excludedUnmappedPlayers') = 'array'
                 then jsonb_array_length(payload->'excludedUnmappedPlayers') between 1 and 6
                 else false end), false) then
    raise exception using errcode='PT400', message='sofascore_request_invalid'; end if;
  v_except := payload ? 'excludedUnmappedPlayers';
  -- A provider match carries facts, never an opinion: estimates, corrections and
  -- caller-supplied non-participants stay out. The non-participants are computed below.
  if app_private.fantasy_observation_estimated(payload) or payload ? 'expectedDigest'
    or payload ? 'reviewer' or payload ? 'estimateAcceptance' or payload ? 'verifiedNonParticipants'
    or payload ? 'estimatedNonParticipants'
    -- Anonymous starters only as the counts of the starters left out below, checked there.
    or (payload ? 'anonymousStarters' and (jsonb_typeof(payload->'anonymousStarters') is distinct from 'number'
          or (payload->>'anonymousStarters') !~ '^[0-4]$'))
    or (payload ? 'anonymousByTeam' and jsonb_typeof(payload->'anonymousByTeam') is distinct from 'object') then
    raise exception using errcode='PT400', message='sofascore_request_invalid'; end if;
  v_event := p_request->>'sofascoreEventId';

  -- Evidence is SofaScore's, as a fact or as unknown, and nothing else. On a
  -- limited-coverage match the player-statistics fields cannot be known: saves,
  -- penalties saved and penalties missed are never facts there, and an assist is
  -- one only when an incident names the assister.
  for e in select value as player_row from jsonb_array_elements(payload->'players') loop
    if jsonb_typeof(e.player_row->'evidence') is distinct from 'object'
      or exists(select 1 from jsonb_each(e.player_row->'evidence') ev
                where ev.value->>'source' is distinct from 'sofascore'
                   or ev.value->>'state' not in ('verified', 'unknown')) then
      raise exception using errcode='PT400', message='sofascore_evidence_invalid'; end if;
    if v_coverage = 'limited' and exists(
        select 1 from jsonb_each(e.player_row->'evidence') ev
         where ev.key in ('saves', 'penaltiesSaved', 'penaltiesMissed') and ev.value->>'state' = 'verified') then
      raise exception using errcode='PT400', message='sofascore_limited_coverage_fields'; end if;
    if v_coverage = 'limited' and (e.player_row->'stats' ?| array['saves', 'penaltiesSaved', 'penaltiesMissed']) then
      raise exception using errcode='PT400', message='sofascore_limited_coverage_fields'; end if;
  end loop;

  select * into f from app.fixtures where id = p_fixture_id;
  if not found then raise exception using errcode='PT404', message='sofascore_fixture_not_found'; end if;

  -- The fixture is the one a reviewed mapping says this SofaScore match is.
  if not exists(select 1 from app_private.football_provider_mappings m
                 where m.provider_name = 'sofascore' and m.entity_type = 'fixture'
                   and m.external_id = v_event and m.internal_entity_id = f.id and m.active) then
    raise exception using errcode='PT409', message='sofascore_fixture_mapping_missing'; end if;

  -- Every player is a reviewed SofaScore identity pointing at the player the row names.
  for player in select value from jsonb_array_elements(payload->'players') loop
    v_external := player#>>'{identity,sofascoreId}';
    if v_external is null or char_length(v_external) not between 1 and 200 then
      raise exception using errcode='PT400', message='sofascore_identity_missing'; end if;
    -- The id itself, or a second SofaScore id of the player (20261014170000): an alias counts only
    -- while its player's main link is active and reviewed and the alias carries its staff proof.
    v_state := app_private.sofascore_player_identity(v_external);
    if v_state is null or (v_state->>'active')::boolean is not true or (v_state->>'reviewed')::boolean is not true
      or lower(v_state->>'appPlayerId') is distinct from lower(player->>'playerId') then
      raise exception using errcode='PT409', message='sofascore_identity_not_reviewed',
        detail = 'sofascore:' || v_external; end if;
  end loop;

  -- Unmapped substitutes left out of the rows. The builder lists a substitute only when no
  -- incident or statistic gives him a goal, own goal, penalty, assist or card and he did not
  -- start. Here the database confirms the rest, on its own data, for each one: no mapping of
  -- any kind exists for that SofaScore id; the auto-mapping queue holds him open with reason
  -- 'no_candidate' for the club he played for (no squad member matched his name); and no
  -- squad member of that club who is still unmapped could be him (same shirt number, or no
  -- shirt number on file and a compatible position), because the squad members missing from
  -- the rows are recorded below as NOT having played. Anything else refuses the whole request.
  if v_except then
    for x in select value from jsonb_array_elements(payload->'excludedUnmappedPlayers') loop
      if jsonb_typeof(x) is distinct from 'object'
        or exists(select 1 from jsonb_object_keys(x) k
                   where k not in ('sofascoreId', 'side', 'shirtNumber', 'position', 'reason', 'started'))
        or (x ? 'started' and jsonb_typeof(x->'started') is distinct from 'boolean')
        or coalesce(x->>'sofascoreId', '') !~ '^[^[:space:]]{1,200}$'
        or coalesce(x->>'side', '') not in ('home', 'away')
        or x->>'reason' is distinct from 'no_candidate'
        or (x ? 'shirtNumber' and not (jsonb_typeof(x->'shirtNumber') = 'null'
              or (jsonb_typeof(x->'shirtNumber') = 'number' and (x->>'shirtNumber') ~ '^[0-9]{1,3}$')))
        or (x ? 'position' and not (jsonb_typeof(x->'position') = 'null'
              or (jsonb_typeof(x->'position') = 'string' and (x->>'position') in ('G', 'D', 'M', 'F'))))
        or exists(select 1 from jsonb_array_elements(payload->'players') r
                   where r#>>'{identity,sofascoreId}' = x->>'sofascoreId')
        or (select count(*) from jsonb_array_elements(payload->'excludedUnmappedPlayers') y
             where y->>'sofascoreId' = x->>'sofascoreId') <> 1 then
        raise exception using errcode='PT400', message='sofascore_request_invalid'; end if;
      v_excl_team := case x->>'side' when 'home' then f.home_team_id else f.away_team_id end;
      v_excl_pos := case x->>'position' when 'G' then 'goalkeeper' when 'D' then 'defender'
                                        when 'M' then 'midfielder' when 'F' then 'forward' end;
      v_excl_shirt := case when jsonb_typeof(x->'shirtNumber') = 'number' then (x->>'shirtNumber')::integer end;
      if exists(select 1 from app_private.football_provider_mappings m
                 where m.provider_name = 'sofascore' and m.entity_type = 'player' and m.external_id = x->>'sofascoreId')
        or exists(select 1 from app_private.sofascore_player_aliases al where al.sofascore_player_id = x->>'sofascoreId')
        or not exists(select 1 from app_private.sofascore_player_match_queue q
                       where q.sofascore_player_id = x->>'sofascoreId' and q.reason = 'no_candidate'
                         and q.resolved_at is null and q.team_id = v_excl_team)
        or exists(select 1 from app.team_memberships mem join app.players pl on pl.id = mem.player_id
                   where mem.team_id = v_excl_team and mem.season_id = f.season_id
                     and mem.valid_from <= f.kickoff_at::date
                     and (mem.valid_to is null or mem.valid_to >= f.kickoff_at::date)
                     and not exists(select 1 from app_private.football_provider_mappings pm
                                     where pm.provider_name = 'sofascore' and pm.entity_type = 'player'
                                       and pm.internal_entity_id = mem.player_id and pm.active)
                     and ((v_excl_shirt is not null and mem.shirt_number = v_excl_shirt)
                       or (mem.shirt_number is null and (v_excl_pos is null or pl.position::text = v_excl_pos)))) then
        raise exception using errcode='PT409', message='sofascore_unmapped_exclusion_refused',
          detail = 'sofascore:' || (x->>'sofascoreId'); end if;
      v_excluded := v_excluded + 1;
      if coalesce((x->>'started')::boolean, false) then
        if x->>'side' = 'home' then v_anon_home := v_anon_home + 1; else v_anon_away := v_anon_away + 1; end if;
      end if;
    end loop;
  end if;

  -- Starters left out are the only anonymous starters, at most two a club, and the request
  -- must say exactly that (the recorder then checks eleven a side with them).
  v_anon_expected := '{}'::jsonb;
  if v_anon_home > 0 then v_anon_expected := v_anon_expected || jsonb_build_object(f.home_team_id::text, v_anon_home); end if;
  if v_anon_away > 0 then v_anon_expected := v_anon_expected || jsonb_build_object(f.away_team_id::text, v_anon_away); end if;
  if v_anon_home > 2 or v_anon_away > 2
    or coalesce((payload->>'anonymousStarters')::integer, 0) <> v_anon_home + v_anon_away
    or coalesce(payload->'anonymousByTeam', '{}'::jsonb) <> v_anon_expected then
    raise exception using errcode='PT400', message='sofascore_request_invalid'; end if;

  -- A player left out must not be one the score depends on: each club's goals in the rows
  -- still add up to the final score (otherwise the observation could not be scored at all).
  if v_except then
    select coalesce(sum(case when (r->>'teamId')::uuid = f.home_team_id then coalesce((r#>>'{stats,goals}')::integer, 0)
                             else coalesce((r#>>'{stats,ownGoals}')::integer, 0) end), 0),
           coalesce(sum(case when (r->>'teamId')::uuid = f.away_team_id then coalesce((r#>>'{stats,goals}')::integer, 0)
                             else coalesce((r#>>'{stats,ownGoals}')::integer, 0) end), 0)
      into v_home_goals, v_away_goals
      from jsonb_array_elements(payload->'players') r;
    if v_home_goals is distinct from f.home_score or v_away_goals is distinct from f.away_score then
      raise exception using errcode='PT409', message='sofascore_unmapped_exclusion_refused',
        detail = 'goals'; end if;
  end if;

  -- Squad members of either team who are not in the rows did not take part: the
  -- builder sent a row for everyone SofaScore says appeared, and refuses the match
  -- when an appearing player has no reviewed mapping, except the confirmed exclusions above.
  v_rows := payload->'players';
  select coalesce(jsonb_agg(distinct m.player_id::text), '[]'::jsonb) into v_absent
    from app.team_memberships m
   where m.season_id = f.season_id and m.team_id in (f.home_team_id, f.away_team_id)
     and m.valid_from <= f.kickoff_at::date and (m.valid_to is null or m.valid_to >= f.kickoff_at::date)
     and not exists(select 1 from jsonb_array_elements(v_rows) r where r->>'playerId' = m.player_id::text);
  payload := (payload - 'squadComplete' - 'squadCompleteExceptExcluded') || jsonb_build_object('verifiedNonParticipants', v_absent);

  begin
    select fixture_id into link_fixture from app_private.football_provider_fixture_links
     where provider_name = 'sofascore' and external_fixture_id = v_event;
    if link_fixture is not null and link_fixture <> f.id then
      raise exception using errcode='PT409', message='sofascore_fixture_link_conflict'; end if;
    if exists(select 1 from app_private.football_provider_fixture_links
               where provider_name = 'sofascore' and fixture_id = f.id and external_fixture_id <> v_event) then
      raise exception using errcode='PT409', message='sofascore_fixture_link_conflict'; end if;
    insert into app_private.football_provider_fixture_links(provider_name, external_fixture_id, fixture_id)
    values ('sofascore', v_event, f.id) on conflict do nothing;
    if not exists(select 1 from app_private.football_provider_fixture_links
                   where provider_name = 'sofascore' and external_fixture_id = v_event and fixture_id = f.id) then
      raise exception using errcode='PT409', message='sofascore_fixture_link_conflict'; end if;

    select count(*) into before_count from app_private.fantasy_fixture_observations where fixture_id = f.id;
    perform set_config('botolago.reconciled_ingestion', 'on', true);
    result := api.service_record_fantasy_observation(f.id,
      payload || jsonb_build_object('sourceRefs', jsonb_build_object(
        'sofascoreEventId', v_event,
        'mappingSnapshotDigest', p_request->>'mappingSnapshotDigest',
        'coverage', v_coverage)),
      'provider-reconciled');
    perform set_config('botolago.reconciled_ingestion', '', true);
    select id into latest from app_private.fantasy_fixture_observations
     where fixture_id = f.id order by observed_at desc, id desc limit 1;
    result := result || jsonb_build_object(
      'created', (select count(*) from app_private.fantasy_fixture_observations where fixture_id = f.id) > before_count,
      'latest', latest = (result->>'observationId')::bigint,
      'dryRun', p_dry_run,
      'coverage', v_coverage,
      'nonParticipants', jsonb_array_length(v_absent),
      'excludedUnmapped', v_excluded);
    if p_dry_run or not (result->>'created')::boolean then
      raise exception using errcode='P0001', message='sofascore_dry_run_rollback';
    end if;
  exception when raise_exception then
    perform set_config('botolago.reconciled_ingestion', '', true);
    if sqlerrm = 'sofascore_dry_run_rollback' then return result; end if;
    raise;
  end;
  return result;
end $$;

-- The player performances sync (20261011180000): the identity check reads the identity above.
create or replace function app_private.sofascore_sync_fixture_performances(p_fixture_id uuid, p_ratings jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f app.fixtures%rowtype;
  o app_private.fantasy_fixture_observations%rowtype;
  v_event text;
  v_version text;
  v_rows jsonb;
  r jsonb;
  v_external text;
  v_state jsonb;
  v_field text;
  v_count integer;
  v_current integer;
  v_changed integer := 0;
  v_deactivated integer := 0;
  v_outcome text;
begin
  -- One writer per fixture: two concurrent syncs would race for the active key.
  perform pg_advisory_xact_lock(hashtextextended('sofascore_player_performances:' || p_fixture_id::text, 0));

  select * into f from app.fixtures where id = p_fixture_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'sofascore_performances_fixture_not_found'; end if;
  if f.status <> 'finished' or f.finalized_at is null then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_fixture_not_finished'; end if;

  select * into o from app_private.fantasy_fixture_observations
   where fixture_id = f.id order by observed_at desc, id desc limit 1;
  if not found then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_no_observation'; end if;
  v_event := o.payload #>> '{sourceRefs,sofascoreEventId}';
  -- A reviewed correction, or another provider's observation, is the newest
  -- word on this fixture: it is not ours to turn into rows.
  if o.source <> 'provider-reconciled' or coalesce(v_event, '') !~ '^[0-9]{1,20}$' then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_observation_not_sofascore'; end if;
  -- The core facts (minutes, goals, own goals, cards, goals conceded, clean sheet)
  -- of every row are established and add up to the final score.
  if not o.simple_ready then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_observation_incomplete'; end if;
  if (o.payload ->> 'homeScore')::integer is distinct from f.home_score
    or (o.payload ->> 'awayScore')::integer is distinct from f.away_score then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_score_mismatch'; end if;

  -- The fixture is the one a reviewed mapping and the link say this match is.
  if not exists (select 1 from app_private.football_provider_mappings m
        where m.provider_name = 'sofascore' and m.entity_type = 'fixture'
          and m.external_id = v_event and m.internal_entity_id = f.id and m.active)
    or not exists (select 1 from app_private.football_provider_fixture_links l
        where l.provider_name = 'sofascore' and l.external_fixture_id = v_event and l.fixture_id = f.id) then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_fixture_mapping_missing'; end if;

  -- A fixture another provider already covers keeps that provider's rows.
  if exists (select 1 from app.player_fixture_performances p
      where p.fixture_id = f.id and p.active and p.source_provider is distinct from 'sofascore') then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_other_provider_rows'; end if;

  v_rows := o.payload -> 'players';
  if jsonb_typeof(v_rows) is distinct from 'array' or jsonb_array_length(v_rows) not between 18 and 100 then
    raise exception using errcode = 'PT409', message = 'sofascore_performances_observation_incomplete'; end if;

  -- Every player is, today, a reviewed SofaScore identity pointing at the
  -- player the row names, and every row is a club of this fixture with the
  -- core facts established.
  for r in select value from jsonb_array_elements(v_rows) loop
    v_external := r #>> '{identity,sofascoreId}';
    if v_external is null or char_length(v_external) not between 1 and 200 then
      raise exception using errcode = 'PT409', message = 'sofascore_performances_identity_not_reviewed'; end if;
    -- The id itself, or a second SofaScore id of the player (20261014170000).
    v_state := app_private.sofascore_player_identity(v_external);
    if v_state is null or (v_state ->> 'active')::boolean is not true
      or (v_state ->> 'reviewed')::boolean is not true
      or lower(v_state ->> 'appPlayerId') is distinct from lower(r ->> 'playerId') then
      raise exception using errcode = 'PT409', message = 'sofascore_performances_identity_not_reviewed',
        detail = 'sofascore:' || v_external; end if;
    if (r ->> 'teamId')::uuid not in (f.home_team_id, f.away_team_id)
      or not exists (select 1 from app.players pl where pl.id = (r ->> 'playerId')::uuid) then
      raise exception using errcode = 'PT409', message = 'sofascore_performances_row_invalid'; end if;
    foreach v_field in array array['minutes', 'goals', 'goalsConceded', 'cleanSheet', 'yellowCards',
        'redCards', 'secondYellowDismissals', 'ownGoals'] loop
      if r #>> array['evidence', v_field, 'state'] is distinct from 'verified'
        or r #> array['stats', v_field] is null then
        raise exception using errcode = 'PT409', message = 'sofascore_performances_core_unverified'; end if;
    end loop;
  end loop;
  v_count := jsonb_array_length(v_rows);
  v_version := 'sofascore-observation:' || o.digest;

  select count(*) into v_current from app.player_fixture_performances p
   where p.fixture_id = f.id and p.active and p.source_version = v_version;
  if v_current = v_count and not exists (select 1 from app.player_fixture_performances p
      where p.fixture_id = f.id and p.active and p.source_version <> v_version) then
    v_outcome := 'unchanged';
  else
    -- A newer observation replaces the rows of the older one: set inactive,
    -- not deleted, only ours.
    update app.player_fixture_performances set active = false
     where fixture_id = f.id and active and source_provider = 'sofascore' and source_version <> v_version;
    get diagnostics v_deactivated = row_count;
    insert into app.player_fixture_performances (
      football_season_id, fixture_id, player_id, team_id, position, source_provider, source_version,
      started, appeared, minutes, goals, assists, clean_sheets, goals_conceded, saves,
      penalties_saved, penalties_missed, yellow_cards, red_cards, second_yellow_dismissals,
      own_goals, provider_rating, active, provider_observed_at)
    select f.season_id, f.id, (e.value ->> 'playerId')::uuid, (e.value ->> 'teamId')::uuid, pl.position,
      'sofascore', v_version, (e.value ->> 'started')::boolean, true,
      (e.value #>> '{stats,minutes}')::integer, (e.value #>> '{stats,goals}')::integer,
      case when e.value #>> '{evidence,assists,state}' = 'verified'
        then (e.value #>> '{stats,assists}')::integer end,
      case when (e.value #>> '{stats,cleanSheet}')::boolean then 1 else 0 end,
      (e.value #>> '{stats,goalsConceded}')::integer,
      case when e.value #>> '{evidence,saves,state}' = 'verified'
        then (e.value #>> '{stats,saves}')::integer end,
      case when e.value #>> '{evidence,penaltiesSaved,state}' = 'verified'
        then (e.value #>> '{stats,penaltiesSaved}')::integer end,
      case when e.value #>> '{evidence,penaltiesMissed,state}' = 'verified'
        then (e.value #>> '{stats,penaltiesMissed}')::integer end,
      (e.value #>> '{stats,yellowCards}')::integer, (e.value #>> '{stats,redCards}')::integer,
      (e.value #>> '{stats,secondYellowDismissals}')::integer, (e.value #>> '{stats,ownGoals}')::integer,
      null, true, o.observed_at
    from jsonb_array_elements(v_rows) e(value)
    join app.players pl on pl.id = (e.value ->> 'playerId')::uuid
    on conflict on constraint player_fixture_performances_source_key do update set
      team_id = excluded.team_id, position = excluded.position, started = excluded.started,
      appeared = excluded.appeared, minutes = excluded.minutes, goals = excluded.goals,
      assists = excluded.assists, clean_sheets = excluded.clean_sheets,
      goals_conceded = excluded.goals_conceded, saves = excluded.saves,
      penalties_saved = excluded.penalties_saved, penalties_missed = excluded.penalties_missed,
      yellow_cards = excluded.yellow_cards, red_cards = excluded.red_cards,
      second_yellow_dismissals = excluded.second_yellow_dismissals, own_goals = excluded.own_goals,
      active = true, provider_observed_at = excluded.provider_observed_at;
    v_outcome := 'written';
  end if;

  -- The rating SofaScore gave in the same lineup reply, when the caller has it
  -- (display only; the rows never depend on it). Set or corrected, never cleared.
  if p_ratings is not null then
    update app.player_fixture_performances p set provider_rating = round((p_ratings ->> x.external_id)::numeric, 2)
      from (select (e.value ->> 'playerId')::uuid as player_id, e.value #>> '{identity,sofascoreId}' as external_id
              from jsonb_array_elements(v_rows) e(value)) x
     where p.fixture_id = f.id and p.active and p.source_version = v_version
       and p.player_id = x.player_id and p_ratings ? x.external_id
       and p.provider_rating is distinct from round((p_ratings ->> x.external_id)::numeric, 2);
    get diagnostics v_changed = row_count;
    if v_outcome = 'unchanged' and v_changed > 0 then v_outcome := 'rated'; end if;
  end if;

  return jsonb_build_object(
    'fixtureId', f.id, 'outcome', v_outcome, 'sourceVersion', v_version, 'rows', v_count,
    'replaced', v_deactivated, 'rated', v_changed, 'sofascoreEventId', v_event,
    'unknownFields', jsonb_build_object(
      'assists', (select count(*) from app.player_fixture_performances p
        where p.fixture_id = f.id and p.active and p.source_version = v_version and p.assists is null),
      'penaltiesMissed', (select count(*) from app.player_fixture_performances p
        where p.fixture_id = f.id and p.active and p.source_version = v_version and p.penalties_missed is null),
      'goalkeeperSaves', (select count(*) from app.player_fixture_performances p
        where p.fixture_id = f.id and p.active and p.source_version = v_version
          and p.position = 'goalkeeper' and p.saves is null)));
end $$;

-- The review list (20261011130000): candidates also show whether their main link is active and their
-- second ids, and each entry says whether "create this player" can be offered.
create or replace function api.admin_sofascore_player_match_queue()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'sofascorePlayerId', q.sofascore_player_id,
      'name', q.name, 'shortName', q.short_name, 'shirtNumber', q.shirt_number, 'position', q.position,
      'side', q.side, 'reason', q.reason, 'fixtureId', q.fixture_id, 'teamId', q.team_id,
      'teamName', t.name,
      'firstSeenAt', q.first_seen_at, 'lastSeenAt', q.last_seen_at, 'timesSeen', q.times_seen,
      -- 20261014170000: whether "create this player" can be offered (a club, a position, a name, a
      -- current season); the action checks it again.
      'canCreate', app_private.sofascore_queue_create_season(q.sofascore_player_id) is not null
        and q.position in ('goalkeeper', 'defender', 'midfielder', 'forward')
        and char_length(btrim(q.name)) between 2 and 200,
      'candidates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'playerId', pl.id, 'fullName', pl.full_name, 'displayName', pl.display_name,
          'position', pl.position::text,
          'shirtNumber', (select mem.shirt_number from app.team_memberships mem
                           where mem.player_id = pl.id and mem.team_id = q.team_id and mem.active
                           order by mem.valid_from desc limit 1),
          'mappedToSofascoreId', (select m.external_id from app_private.football_provider_mappings m
                                   where m.provider_name = 'sofascore' and m.entity_type = 'player'
                                     and m.internal_entity_id = pl.id limit 1),
          'mappedActive', (select m.active from app_private.football_provider_mappings m
                            where m.provider_name = 'sofascore' and m.entity_type = 'player'
                              and m.internal_entity_id = pl.id limit 1),
          'sofascoreAliasIds', app_private.sofascore_player_alias_ids(pl.id)) order by pl.full_name)
        from app.players pl where pl.id = any (q.candidate_player_ids)), '[]'::jsonb))
      order by q.last_seen_at desc, q.sofascore_player_id)
    from (select * from app_private.sofascore_player_match_queue where resolved_at is null
           order by last_seen_at desc, sofascore_player_id limit 500) q
    left join app.teams t on t.id = q.team_id), '[]'::jsonb);
end $$;

-- Staff resolution (20261012120000): a second id, or a player who has one, is a conflict there.
create or replace function api.admin_resolve_sofascore_player_match(p_sofascore_player_id text, p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_principal uuid := app_private.admin_assert_permission('football.manage_mappings');
  v_user uuid;
  q app_private.sofascore_player_match_queue%rowtype;
  v_log uuid := gen_random_uuid();
  v_mapping uuid;
  v_reopened integer := 0;
begin
  if p_sofascore_player_id is null or p_player_id is null
    or p_sofascore_player_id <> btrim(p_sofascore_player_id)
    or char_length(p_sofascore_player_id) not between 1 and 200 then
    raise exception using errcode = 'PT400', message = 'invalid_resolution'; end if;
  select auth_user_id into v_user from app_private.staff_principals where id = v_principal;
  perform pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0));

  select * into q from app_private.sofascore_player_match_queue
   where sofascore_player_id = p_sofascore_player_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'queue_entry_not_found'; end if;
  if q.resolved_at is not null then
    if q.resolved_player_id = p_player_id then
      return jsonb_build_object('sofascorePlayerId', q.sofascore_player_id, 'playerId', p_player_id,
        'alreadyResolved', true);
    end if;
    raise exception using errcode = 'PT409', message = 'queue_entry_already_resolved'; end if;
  if not exists (select 1 from app.players where id = p_player_id) then
    raise exception using errcode = 'PT404', message = 'player_not_found'; end if;
  -- Conflicts are refused, never resolved by overwriting.
  -- A second SofaScore id (20261014170000) is a link too: "link as second ID" is its own action.
  if exists (select 1 from app_private.football_provider_mappings m
              where m.provider_name = 'sofascore' and m.entity_type = 'player'
                and (m.external_id = p_sofascore_player_id or m.internal_entity_id = p_player_id))
    or exists (select 1 from app_private.sofascore_player_aliases al
                where al.sofascore_player_id = p_sofascore_player_id or al.player_id = p_player_id) then
    raise exception using errcode = 'PT409', message = 'sofascore_mapping_conflict'; end if;

  insert into app_private.football_provider_mappings (
    provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active,
    manually_corrected, correction_reason, corrected_by, corrected_at)
  values ('sofascore', 'player', p_sofascore_player_id, p_player_id,
    'sofascore-admin-resolve:' || v_log::text, statement_timestamp(), true,
    true, 'Chosen by staff from the SofaScore player review list.', v_user, statement_timestamp())
  on conflict do nothing
  returning id into v_mapping;
  if v_mapping is null then
    raise exception using errcode = 'PT409', message = 'sofascore_mapping_conflict'; end if;
  insert into app_private.sofascore_player_match_log (id, method, mapping_id, sofascore_player_id, player_id,
    fixture_id, evidence, decided_by)
  values (v_log, 'staff-resolution', v_mapping, p_sofascore_player_id, p_player_id, q.fixture_id,
    jsonb_build_object('sofascoreName', q.name, 'queueReason', q.reason), v_user);
  update app_private.sofascore_player_match_queue
     set resolved_at = statement_timestamp(), resolved_by = v_user, resolved_player_id = p_player_id
   where sofascore_player_id = p_sofascore_player_id;
  -- His club's finished matches that wait on a player identity are tried again on the next
  -- tick instead of after their back-off (app_private.sofascore_fantasy_reopen).
  v_reopened := app_private.sofascore_fantasy_reopen(q.team_id, null);
  return jsonb_build_object('sofascorePlayerId', p_sofascore_player_id, 'playerId', p_player_id,
    'mappingId', v_mapping, 'alreadyResolved', false, 'reopened', v_reopened);
end $$;

-- ===========================================================================
-- 8. Staff actions
-- ===========================================================================
-- Read: the players staff can link one list entry to. With no query, the entry's club squad this
-- season; with a query of 2 to 80 characters, the catalog by name (a person choosing; nothing here
-- decides anything). Each with his club, shirt, position and SofaScore state (main id and second ids).
create function api.admin_sofascore_player_link_options(p_sofascore_player_id text, p_query text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
  q app_private.sofascore_player_match_queue%rowtype;
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_pattern text;
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  if p_sofascore_player_id is null or p_sofascore_player_id <> btrim(p_sofascore_player_id)
    or char_length(p_sofascore_player_id) not between 1 and 200
    or (v_query is not null and char_length(v_query) not between 2 and 80) then
    raise exception using errcode = 'PT400', message = 'invalid_resolution'; end if;
  select * into q from app_private.sofascore_player_match_queue where sofascore_player_id = p_sofascore_player_id;
  if not found then raise exception using errcode = 'PT404', message = 'queue_entry_not_found'; end if;
  v_pattern := '%' || replace(replace(replace(coalesce(v_query, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return jsonb_build_object(
    'sofascorePlayerId', q.sofascore_player_id,
    'teamId', q.team_id,
    'query', v_query,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', c.id, 'fullName', c.full_name, 'displayName', c.display_name,
        'position', c.position, 'teamId', c.team_id, 'teamName', c.team_name,
        'shirtNumber', c.shirt_number, 'inClub', c.in_club,
        'sofascoreId', c.sofascore_id, 'sofascoreActive', c.sofascore_active,
        'sofascoreAliasIds', app_private.sofascore_player_alias_ids(c.id))
        order by c.in_club desc, c.full_name, c.id)
      from (
        select pl.id, pl.full_name, pl.display_name, pl.position::text as position,
               cm.team_id, t.name as team_name, cm.shirt_number,
               coalesce(cm.team_id = q.team_id, false) as in_club,
               m.external_id as sofascore_id, m.active as sofascore_active
          from app.players pl
          left join lateral (
            select mem.team_id, mem.shirt_number from app.team_memberships mem
              join app.seasons s on s.id = mem.season_id and s.is_current
             where mem.player_id = pl.id and mem.active
             order by (mem.team_id = q.team_id) desc, mem.valid_from desc limit 1) cm on true
          left join app.teams t on t.id = cm.team_id
          left join app_private.football_provider_mappings m
            on m.provider_name = 'sofascore' and m.entity_type = 'player' and m.internal_entity_id = pl.id
         where pl.active
           and case when v_query is null then cm.team_id is not distinct from q.team_id and q.team_id is not null
                    else (pl.full_name ilike v_pattern or pl.display_name ilike v_pattern) end
         order by coalesce(cm.team_id = q.team_id, false) desc, pl.full_name, pl.id
         limit 40) c), '[]'::jsonb));
end $$;

-- "Link as second ID": the list entry's SofaScore id becomes a second id of the chosen player, who
-- keeps his main link. Refuses a player without an active main link (link him the ordinary way) and
-- any id already linked.
create function api.admin_sofascore_link_alias(p_sofascore_player_id text, p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_principal uuid := app_private.admin_assert_permission('football.manage_mappings');
  v_user uuid;
  q app_private.sofascore_player_match_queue%rowtype;
begin
  if p_sofascore_player_id is null or p_player_id is null
    or p_sofascore_player_id <> btrim(p_sofascore_player_id)
    or char_length(p_sofascore_player_id) not between 1 and 200 then
    raise exception using errcode = 'PT400', message = 'invalid_resolution'; end if;
  select auth_user_id into v_user from app_private.staff_principals where id = v_principal;
  perform pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0));
  select * into q from app_private.sofascore_player_match_queue
   where sofascore_player_id = p_sofascore_player_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'queue_entry_not_found'; end if;
  if q.resolved_at is not null and q.resolved_player_id is distinct from p_player_id then
    raise exception using errcode = 'PT409', message = 'queue_entry_already_resolved'; end if;
  return app_private.sofascore_link_alias(p_sofascore_player_id, p_player_id, v_user,
    jsonb_build_object('source', 'admin-review-list'));
end $$;

-- "Create this player from SofaScore": the catalog player (the matcher's own creation, section 5)
-- for the entry's club and current season, then his main SofaScore link as a staff resolution
-- (reviewed, as api.admin_resolve_sofascore_player_match makes it). Name, shirt and position default
-- to the entry's; staff may correct them. The club is the entry's.
create function api.admin_sofascore_create_player(
  p_sofascore_player_id text, p_name text default null, p_shirt_number integer default null,
  p_position text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_principal uuid := app_private.admin_assert_permission('football.manage_mappings');
  v_user uuid;
  q app_private.sofascore_player_match_queue%rowtype;
  v_season uuid;
  v_name text;
  v_position text;
  v_shirt integer;
  v_creation jsonb;
  v_player uuid;
  v_log uuid := gen_random_uuid();
  v_mapping uuid;
  v_reopened integer := 0;
begin
  if p_sofascore_player_id is null or p_sofascore_player_id <> btrim(p_sofascore_player_id)
    or char_length(p_sofascore_player_id) not between 1 and 200
    or (p_shirt_number is not null and p_shirt_number not between 0 and 99)
    or (p_position is not null and p_position not in ('goalkeeper', 'defender', 'midfielder', 'forward'))
    or (p_name is not null and char_length(btrim(p_name)) not between 2 and 200) then
    raise exception using errcode = 'PT400', message = 'invalid_resolution'; end if;
  select auth_user_id into v_user from app_private.staff_principals where id = v_principal;
  perform pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0));
  select * into q from app_private.sofascore_player_match_queue
   where sofascore_player_id = p_sofascore_player_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'queue_entry_not_found'; end if;
  if q.resolved_at is not null then
    raise exception using errcode = 'PT409', message = 'queue_entry_already_resolved'; end if;
  if exists (select 1 from app_private.football_provider_mappings m
              where m.provider_name = 'sofascore' and m.entity_type = 'player'
                and m.external_id = p_sofascore_player_id)
    or exists (select 1 from app_private.sofascore_player_aliases a
                where a.sofascore_player_id = p_sofascore_player_id) then
    raise exception using errcode = 'PT409', message = 'sofascore_mapping_conflict'; end if;
  if q.team_id is null then
    raise exception using errcode = 'PT409', message = 'sofascore_create_no_club'; end if;
  v_season := app_private.sofascore_queue_create_season(p_sofascore_player_id);
  if v_season is null then
    raise exception using errcode = 'PT409', message = 'sofascore_create_season_not_current'; end if;
  v_name := btrim(coalesce(p_name, q.name));
  v_position := coalesce(p_position, q.position);
  v_shirt := coalesce(p_shirt_number, q.shirt_number);
  if v_position is null or v_position not in ('goalkeeper', 'defender', 'midfielder', 'forward') then
    raise exception using errcode = 'PT400', message = 'sofascore_create_position_required'; end if;

  v_creation := app_private.sofascore_create_catalog_player(v_season, q.team_id, v_name, v_shirt, v_position);
  v_player := (v_creation ->> 'playerId')::uuid;
  insert into app_private.football_provider_mappings (
    provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at, active,
    manually_corrected, correction_reason, corrected_by, corrected_at)
  values ('sofascore', 'player', p_sofascore_player_id, v_player,
    'sofascore-admin-resolve:' || v_log::text, statement_timestamp(), true,
    true, 'Created by staff from the SofaScore player review list.', v_user, statement_timestamp())
  returning id into v_mapping;
  insert into app_private.sofascore_player_match_log (id, method, mapping_id, sofascore_player_id, player_id,
    fixture_id, evidence, decided_by)
  values (v_log, 'staff-resolution', v_mapping, p_sofascore_player_id, v_player, q.fixture_id,
    jsonb_build_object('action', 'create', 'source', 'admin-review-list', 'sofascoreName', q.name,
      'queueReason', q.reason, 'name', v_name, 'shirtNumber', v_shirt,
      'membershipShirt', v_creation -> 'membershipShirt', 'position', v_position, 'teamId', q.team_id,
      'seasonId', v_season, 'fantasyPlayerId', v_creation -> 'fantasyPlayerId',
      'price', v_creation -> 'price'), v_user);
  update app_private.sofascore_player_match_queue
     set resolved_at = statement_timestamp(), resolved_by = v_user, resolved_player_id = v_player
   where sofascore_player_id = p_sofascore_player_id;
  v_reopened := app_private.sofascore_fantasy_reopen(q.team_id, null);
  return jsonb_build_object('sofascorePlayerId', p_sofascore_player_id, 'playerId', v_player,
    'mappingId', v_mapping, 'created', true, 'membershipShirt', v_creation -> 'membershipShirt',
    'fantasyPlayerId', v_creation -> 'fantasyPlayerId', 'reopened', v_reopened);
end $$;

revoke all on function api.admin_sofascore_player_link_options(text, text),
  api.admin_sofascore_link_alias(text, uuid),
  api.admin_sofascore_create_player(text, text, integer, text)
  from public, anon, service_role;
grant execute on function api.admin_sofascore_player_link_options(text, text),
  api.admin_sofascore_link_alias(text, uuid),
  api.admin_sofascore_create_player(text, text, integer, text)
  to authenticated;
comment on function api.admin_sofascore_player_link_options(text, text) is
  'Staff (football.read_operations or football.manage_mappings, AAL2): players a SofaScore review-list entry can be linked to (the club squad, or the catalog by name), with their SofaScore state.';
comment on function api.admin_sofascore_link_alias(text, uuid) is
  'Staff (football.manage_mappings, AAL2): links a review-list SofaScore id as a second id of a player who keeps his main link. Logged; reopens held matches.';
comment on function api.admin_sofascore_create_player(text, text, integer, text) is
  'Staff (football.manage_mappings, AAL2): creates the review-list SofaScore player in the catalog (current season, Fantasy pool) and links him. Logged; reopens held matches.';
$migration$]);
do $apply$
declare source text;
begin
  select statements[1] into source from supabase_migrations.schema_migrations where version='20261014170000';
  if encode(sha256(convert_to(source,'UTF8')),'hex')
    is distinct from 'bc040f50003f0b8eadbc27f61ff5cef0803e3572fbbd0f8b7a2e71461b543955'
  then raise exception 'stop: migration differs from reviewed repository bytes'; end if;
  execute source;
end $apply$;
do $verify$
begin
  if
    md5((select prosrc from pg_proc where oid='api.service_sofascore_auto_map_players(uuid,jsonb)'::regprocedure))
       is distinct from '9411c40881b6219116f5a60fb1187953'
    or md5((select prosrc from pg_proc where oid='api.service_sofascore_fantasy_context(uuid,text[])'::regprocedure))
       is distinct from 'cdc4f2199eaeeaf25b067570e7f17f03'
    or md5((select prosrc from pg_proc where oid='api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)'::regprocedure))
       is distinct from '0c1a1b973bd3a0c3ad72d92801566ece'
    or md5((select prosrc from pg_proc where oid='app_private.sofascore_sync_fixture_performances(uuid,jsonb)'::regprocedure))
       is distinct from '52b4da92af70fbfc1a625c51869d3aa8'
    or md5((select prosrc from pg_proc where oid='api.admin_sofascore_player_match_queue()'::regprocedure))
       is distinct from 'dffff6edc58c838af914aab370ff8c75'
    or md5((select prosrc from pg_proc where oid='api.admin_resolve_sofascore_player_match(text,uuid)'::regprocedure))
       is distinct from 'a5229469b142310f686e1b7c80cf913d'
    or md5((select prosrc from pg_proc where oid='app_private.sofascore_player_identity(text)'::regprocedure))
       is distinct from '0e0b1305edba0377457029c85464ff24'
    or md5((select prosrc from pg_proc where oid='app_private.sofascore_create_catalog_player(uuid,uuid,text,integer,text)'::regprocedure))
       is distinct from 'b65053239c7578225b209007d149a447'
    or md5((select prosrc from pg_proc where oid='app_private.sofascore_link_alias(text,uuid,uuid,jsonb)'::regprocedure))
       is distinct from 'a1ace5437b4406e6daf2c81df044213b'
    or md5((select prosrc from pg_proc where oid='api.admin_sofascore_player_link_options(text,text)'::regprocedure))
       is distinct from 'bbd7708eb1f90b7326d1bfc448a67cd3'
    or md5((select prosrc from pg_proc where oid='api.admin_sofascore_link_alias(text,uuid)'::regprocedure))
       is distinct from '164fe47bf88e1cdd2795323a6c9629f3'
    or md5((select prosrc from pg_proc where oid='api.admin_sofascore_create_player(text,text,integer,text)'::regprocedure))
       is distinct from '56934be8fa71d7391fd70982067f836b'
  then raise exception 'stop: a function body differs from the reviewed migration'; end if;
  if
    has_function_privilege('anon','api.admin_sofascore_player_link_options(text,text)','execute')
    or has_function_privilege('service_role','api.admin_sofascore_player_link_options(text,text)','execute')
    or not has_function_privilege('authenticated','api.admin_sofascore_player_link_options(text,text)','execute')
    or has_function_privilege('anon','api.admin_sofascore_link_alias(text,uuid)','execute')
    or has_function_privilege('service_role','api.admin_sofascore_link_alias(text,uuid)','execute')
    or not has_function_privilege('authenticated','api.admin_sofascore_link_alias(text,uuid)','execute')
    or has_function_privilege('anon','api.admin_sofascore_create_player(text,text,integer,text)','execute')
    or has_function_privilege('service_role','api.admin_sofascore_create_player(text,text,integer,text)','execute')
    or not has_function_privilege('authenticated','api.admin_sofascore_create_player(text,text,integer,text)','execute')
    or has_function_privilege('anon','app_private.sofascore_player_identity(text)','execute')
    or has_function_privilege('authenticated','app_private.sofascore_player_identity(text)','execute')
    or has_function_privilege('service_role','app_private.sofascore_player_identity(text)','execute')
    or has_function_privilege('anon','app_private.sofascore_player_alias_ids(uuid)','execute')
    or has_function_privilege('authenticated','app_private.sofascore_player_alias_ids(uuid)','execute')
    or has_function_privilege('service_role','app_private.sofascore_player_alias_ids(uuid)','execute')
    or has_function_privilege('anon','app_private.sofascore_create_catalog_player(uuid,uuid,text,integer,text)','execute')
    or has_function_privilege('authenticated','app_private.sofascore_create_catalog_player(uuid,uuid,text,integer,text)','execute')
    or has_function_privilege('service_role','app_private.sofascore_create_catalog_player(uuid,uuid,text,integer,text)','execute')
    or has_function_privilege('anon','app_private.sofascore_link_alias(text,uuid,uuid,jsonb)','execute')
    or has_function_privilege('authenticated','app_private.sofascore_link_alias(text,uuid,uuid,jsonb)','execute')
    or has_function_privilege('service_role','app_private.sofascore_link_alias(text,uuid,uuid,jsonb)','execute')
    or has_function_privilege('anon','app_private.sofascore_queue_create_season(text)','execute')
    or has_function_privilege('authenticated','app_private.sofascore_queue_create_season(text)','execute')
    or has_function_privilege('service_role','app_private.sofascore_queue_create_season(text)','execute')
    or has_table_privilege('anon','app_private.sofascore_player_aliases','select')
    or has_table_privilege('authenticated','app_private.sofascore_player_aliases','select')
    or has_table_privilege('service_role','app_private.sofascore_player_aliases','select')
    or has_function_privilege('authenticated','api.service_sofascore_auto_map_players(uuid,jsonb)','execute')
    or not has_function_privilege('service_role','api.service_sofascore_auto_map_players(uuid,jsonb)','execute')
    or not has_function_privilege('authenticated','api.admin_sofascore_player_match_queue()','execute')
    or not has_function_privilege('authenticated','api.admin_resolve_sofascore_player_match(text,uuid)','execute')
  then raise exception 'stop: permissions differ from the reviewed migration'; end if;
  -- The migration creates objects and replaces functions only: nothing was written.
  if exists(select 1 from catalog_aliases_before b where
    (select count(*) from app_private.football_provider_mappings where provider_name='sofascore' and entity_type='player') <> b.mappings
    or (select md5(string_agg(m.id::text||m.external_id||m.internal_entity_id::text||m.active::text||coalesce(m.source_version,''), ',' order by m.id))
          from app_private.football_provider_mappings m where m.provider_name='sofascore' and m.entity_type='player') is distinct from b.mapping_digest
    or (select count(*) from app_private.sofascore_player_match_log) <> b.log_rows
    or (select md5(string_agg(q.sofascore_player_id||coalesce(q.resolved_at::text,''), ',' order by q.sofascore_player_id))
          from app_private.sofascore_player_match_queue q) is distinct from b.queue_digest
    or (select count(*) from app.players) <> b.players
    or (select count(*) from app.team_memberships) <> b.memberships
    or (select count(*) from app.fantasy_players) <> b.pool
    or (select md5(string_agg(a.fixture_id::text||a.status||a.attempts::text||coalesce(a.next_retry_at::text,''), ',' order by a.fixture_id))
          from app_private.sofascore_fantasy_attempts a) is distinct from b.attempts_digest
    or exists(select 1 from app_private.sofascore_player_aliases))
  then raise exception 'stop: data changed in a way the migration does not do'; end if;
  -- The rules: a staff-alias method, the triggers on both tables, row level security forced.
  if not exists(select 1 from pg_constraint where conname='sofascore_player_match_log_method_check'
                 and pg_get_constraintdef(oid) like '%staff-alias%' and pg_get_constraintdef(oid) like '%exact-name%')
    or not exists(select 1 from pg_constraint where conname='sofascore_player_match_log_staff_check'
                 and pg_get_constraintdef(oid) like '%staff-alias%')
    or not exists(select 1 from pg_trigger where tgname='football_provider_mappings_sofascore_alias_guard'
                 and tgrelid='app_private.football_provider_mappings'::regclass and tgenabled='O')
    or not exists(select 1 from pg_trigger where tgname='sofascore_player_aliases_guard'
                 and tgrelid='app_private.sofascore_player_aliases'::regclass and tgenabled='O')
    or not (select relforcerowsecurity from pg_class where oid='app_private.sofascore_player_aliases'::regclass)
    or not exists(select 1 from pg_constraint where conname='football_provider_mappings_internal_key')
  then raise exception 'stop: a constraint or trigger differs from the reviewed migration'; end if;
end $verify$;
-- What the list holds now, by reason (the owner's review: second profiles, missing players).
select q.reason, count(*) as open_entries
  from app_private.sofascore_player_match_queue q
 where q.resolved_at is null
 group by q.reason order by q.reason;
rollback;
