-- Production install of migration 20261013150000_sofascore_automatch_no_names on tkewgajrljbwgwedqsxn
-- (docs/production/SOFASCORE_AUTOMATIC_RELEASE_RUNBOOK.md, "Follow-up: matching without names").
-- It replaces the SofaScore player auto-matcher so it decides by club, shirt number and position and
-- never by name, and creates a player the catalog has nobody for. It writes no data when applied: no
-- mapping, player or pool entry is created, changed or removed here.
-- 1. Merge the reviewed PR; its database-quality job must have passed.
-- 2. Pause and drain every writer with sofascore-held-maintenance-pause.sql.
-- 3. Run this script as it is (it ends in rollback): every guard and the whole migration run,
--    then nothing stays. Read the last result rows. Confirm independently that the history row
--    is absent again.
-- 4. Change only the final rollback to commit, run it once, read it back independently, and
--    restore the writers with sofascore-held-maintenance-resume.sql right away.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select app_private.hold_scheduled_jobs();
do $preflight$
begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='20261013150000')
    or (select count(*) from supabase_migrations.schema_migrations
         where version in ('20261011130000','20261011190000','20261011191737','20261012120000')) <> 4 then
    raise exception 'stop: automatch migration already present, or a prerequisite migration is missing';
  end if;
  -- The two functions it replaces are exactly the reviewed versions (bodies of 20261011130000),
  -- and nothing it creates exists yet.
  if md5((select prosrc from pg_proc where oid='api.service_sofascore_auto_map_players(uuid,jsonb)'::regprocedure))
       is distinct from '27b3f9b0bc31a041c7754a43efcb8b64'
    or md5((select prosrc from pg_proc where oid='app_private.football_mapping_supporting_state(uuid)'::regprocedure))
       is distinct from '70a9e683d51321cd5812091aa1712fe9'
    or to_regprocedure('app_private.sofascore_position_compatible(text,text)') is not null then
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
create temporary table automatch_before on commit drop as
  select (select count(*) from app_private.football_provider_mappings where provider_name='sofascore' and entity_type='player') as mappings,
         (select md5(string_agg(m.id::text||m.internal_entity_id::text||m.active::text||coalesce(m.source_version,''), ',' order by m.id))
            from app_private.football_provider_mappings m where m.provider_name='sofascore' and m.entity_type='player') as mapping_digest,
         (select count(*) from app_private.sofascore_player_match_log) as log_rows,
         (select count(*) from app_private.sofascore_player_match_queue) as queue_rows,
         (select count(*) from app.players) as players,
         (select count(*) from app.fantasy_players) as pool;
insert into supabase_migrations.schema_migrations(version,name,statements)
values('20261013150000','sofascore_automatch_no_names',array[$migration$-- SofaScore is the single source: the player catalog is keyed on the SofaScore player id, and the
-- automatic matcher decides by club (side), shirt number and position, never by name
-- (docs/backend/SOFASCORE_PLAYER_MATCHING.md).
--
-- WHY. The owner decided that a name must not decide who a SofaScore player is. Names are spelled
-- differently by every provider, and a shared name or last name is how one person's points land on
-- another. A shirt number inside one club's squad on one day is a far stronger key, and it is the
-- key the unmapped-substitute exclusion check (api.service_record_sofascore_fantasy_observation)
-- already uses. A one-time squad-based bulk link (scripts/backend/sofascore-squad-link.ts) establishes
-- the existing catalog; this matcher then keeps it complete without anyone clicking.
--
-- THE RULE. For an appearing SofaScore player with no mapping, on one side of one fixture, the
-- members of that side's club for the fixture's season (active, valid on the kickoff date, no active
-- SofaScore mapping) are looked at by shirt number and position:
--   candidate = same shirt number AND a compatible position (equal; neighbouring lines
--               defender-midfielder or midfielder-forward; or either one unknown; a goalkeeper only
--               with a goalkeeper).
--   exactly one candidate -> LINKED at once, method 'side-shirt-position'.
--   no candidate, no member with that shirt at an incompatible position, no member with no shirt on
--   file and a compatible position (the same test the unmapped-exclusion check uses)
--                         -> a NEW PLAYER IS CREATED (see below), method 'sofascore-created'.
--   anything else -> queued for staff, candidates pre-filled, one click on the admin screen:
--       ambiguous_shirt      two or more candidates
--       shirt_conflict       two SofaScore ids in this very call point at the same one candidate
--       no_shirt_on_file     no candidate, but a squad member with no shirt number on file could be him
--       position_mismatch    the shirt number exists, but only at an incompatible position
--       no_shirt             the lineup has no shirt number for him
--       candidate_already_mapped / inactive_mapping_exists   as before
--       weak_match           one candidate from the squad link, but a position is unknown
--       no_candidate         nobody known and a new player could not be created (no position, a name
--                            under two characters, not the current season, or the catalog refused)
--   The names in the lineup are stored for display and as the new player's name only; nothing here
--   compares one.
--
-- A NEW PLAYER. When SofaScore shows an appearing player the catalog has no one for, the matcher
-- creates him so the match is never held for him and he can be picked like anyone else:
--   * app.players (name from SofaScore, position G/D/M/F -> goalkeeper/defender/midfielder/forward);
--   * a membership at the side's club for the current season, valid for the whole season (so it covers
--     the match being read, whenever it was played), with the shirt number (left blank if another
--     active member holds it, as the player-list update does);
--   * an active SofaScore mapping and a log row of method 'sofascore-created', which
--     football_mapping_supporting_state reports as reviewed (automatic_sofascore_created);
--   * a Fantasy pool entry (app.fantasy_players, status available) priced by
--     app_private.fantasy_initial_price_v1 exactly as the opening catalog and the player-list update
--     price a player with no previous rating (rating 6.0, confidence 0), with its price evidence and
--     price history rows.
--   It takes the same advisory locks as the player-list update (fantasy:catalog exclusively,
--   fantasy:squads shared). It does NOT pause crons or lock tables: it runs from the live refresh,
--   which is itself a cron job. If the catalog refuses (for example while the weekly price processing
--   is between pages) the creation is rolled back and he is queued as no_candidate; the next call tries again.
--
-- WHAT THIS MIGRATION CHANGES.
--   1. app_private.sofascore_position_compatible   the position rule.
--   2. sofascore_player_match_log_method_check     also allows 'side-shirt-position' and 'sofascore-created'.
--   3. sofascore_player_match_queue_reason_check    also allows the new reasons (and a queue entry may have no side). Every old value stays
--      valid: rows already queued keep their reason until the player is next seen.
--   4. app_private.football_mapping_supporting_state  (replaced) also accepts a log row of those two
--      methods as a review proof ('automatic_side_shirt_position', 'automatic_sofascore_created').
--      Everything else in it is byte for byte the version of 20261011130000. The earlier methods stay
--      valid for the mappings already made. The Flashscore supporting-evidence check is unchanged: it
--      still accepts only an executed, person-approved proposal.
--   5. api.service_sofascore_auto_map_players  (replaced) with the rule above. Signature, grants,
--      advisory lock, idempotency as in 20261011130000; the result gains `created` and `createFailed`
--      counts next to {mapped, queued, conflicts}. A link or a creation also sets the club's finished
--      matches that wait on a player identity to be tried on the next tick
--      (app_private.sofascore_fantasy_reopen), as staff resolution does.
--   Staff resolution (api.admin_resolve_sofascore_player_match, with the hands-off reopen of
--   20261012120000) is not touched: confirming a pre-filled candidate is one click.
--
-- Applying it writes no data: no mapping, player or pool entry is created, changed or removed here.
--
-- Prerequisites: 20261011130000 (the function replaced) and 20261012120000 (hands-off).
do $$
begin
  if to_regprocedure('api.service_sofascore_auto_map_players(uuid,jsonb)') is null
    or to_regclass('app_private.sofascore_player_match_log') is null
    or to_regclass('app_private.sofascore_player_match_queue') is null
    or to_regprocedure('app_private.football_mapping_supporting_state(uuid)') is null
    or to_regprocedure('app_private.sofascore_fantasy_reopen(uuid,uuid)') is null
    or to_regprocedure('app_private.fantasy_initial_price_v1(text,numeric,numeric)') is null
    or to_regprocedure('app_private.football_catalog_slug(text,text,uuid)') is null then
    raise exception 'sofascore_automatch_prerequisite_missing: apply migrations 20261011130000 and 20261012120000 first';
  end if;
end $$;

-- ===========================================================================
-- 1. The position rule
-- ===========================================================================
-- Positions are app.football_position values as text (null = unknown). Equal, neighbouring lines
-- (defender-midfielder, midfielder-forward) or either unknown; a goalkeeper only with a goalkeeper.
create function app_private.sofascore_position_compatible(p_a text, p_b text)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_a is null or p_b is null then true
    when p_a = p_b then true
    when p_a = 'goalkeeper' or p_b = 'goalkeeper' then false
    else (p_a = 'midfielder' or p_b = 'midfielder')
  end
$$;
revoke all on function app_private.sofascore_position_compatible(text, text) from public, anon, authenticated, service_role;

-- ===========================================================================
-- 2. Constraints: more methods, more reasons (the old values stay valid)
-- ===========================================================================
alter table app_private.sofascore_player_match_log drop constraint sofascore_player_match_log_method_check;
alter table app_private.sofascore_player_match_log add constraint sofascore_player_match_log_method_check
  check (method in ('exact-name', 'name-and-shirt', 'staff-resolution', 'side-shirt-position', 'sofascore-created'));

alter table app_private.sofascore_player_match_queue drop constraint sofascore_player_match_queue_reason_check;
alter table app_private.sofascore_player_match_queue add constraint sofascore_player_match_queue_reason_check
  check (reason in (
    'no_candidate', 'ambiguous_name', 'partial_name', 'candidate_already_mapped',
    'inactive_mapping_exists', 'position_mismatch', 'duplicate_name_in_squad',
    'ambiguous_shirt', 'no_shirt', 'shirt_conflict', 'no_shirt_on_file', 'weak_match'));

-- The one-time squad link (scripts/backend/sofascore-squad-link.ts) queues suggestions from a club
-- squad, which has no side. A queue entry may now have none; the staff list shows "unknown".
alter table app_private.sofascore_player_match_queue alter column side drop not null;
alter table app_private.sofascore_player_match_queue drop constraint sofascore_player_match_queue_side_check;
alter table app_private.sofascore_player_match_queue add constraint sofascore_player_match_queue_side_check
  check (side is null or side in ('home', 'away'));

-- ===========================================================================
-- 3. "Reviewed", with the third automatic proof
-- ===========================================================================
-- Identical to the 20261011130000 version, except that the log branch also knows
-- 'side-shirt-position' and 'sofascore-created' (source_version 'sofascore-auto-map:<method>:<log id>').
create or replace function app_private.football_mapping_supporting_state(p_mapping_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m app_private.football_provider_mappings%rowtype;
  v_prefix constant text := 'football_player_mapping:';
  v_pid uuid := null;
  v_reviewed boolean := false;
  v_provenance text := 'none';
  v_log app_private.sofascore_player_match_log%rowtype;
  v_parts text[];
  v_expected text;
begin
  select * into m from app_private.football_provider_mappings where id = p_mapping_id;
  if not found then return null; end if;
  if m.source_version like v_prefix || '%'
    and substr(m.source_version, char_length(v_prefix) + 1)
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_pid := substr(m.source_version, char_length(v_prefix) + 1)::uuid;
  end if;
  if m.manually_corrected and m.corrected_by is not null and m.corrected_at is not null
    and m.correction_reason is not null and v_pid is not null then
    v_reviewed := exists (
      select 1
      from app_private.football_player_mapping_proposals pr
      join app_private.staff_principals sp on sp.id = pr.decided_by
      where pr.id = v_pid and pr.status = 'executed'
        and sp.auth_user_id = m.corrected_by
        and pr.reason = m.correction_reason
        and exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(pr.executed_after -> 'rows') = 'array' then pr.executed_after -> 'rows'
                 else jsonb_build_array(pr.executed_after) end) w
          where w ->> 'mappingId' = m.id::text
            and w ->> 'provider' = m.provider_name
            and w ->> 'externalId' = m.external_id
            and w ->> 'appPlayerId' = m.internal_entity_id::text
            and (w ->> 'active')::boolean = m.active));
    if v_reviewed then v_provenance := 'executed_proposal'; end if;
  end if;

  -- Second proof: the automatic matcher's own log. The source_version must be exactly what the
  -- log row says it should be, and the log row must agree with the mapping.
  if not v_reviewed and m.provider_name = 'sofascore' and m.entity_type = 'player' then
    v_parts := regexp_match(coalesce(m.source_version, ''),
      '^sofascore-(auto-map:exact-name|auto-map:name-and-shirt|auto-map:side-shirt-position|auto-map:sofascore-created|admin-resolve):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
    if v_parts is not null then
      select * into v_log from app_private.sofascore_player_match_log where id = v_parts[2]::uuid;
      if found then
        v_expected := case v_log.method
          when 'exact-name' then 'sofascore-auto-map:exact-name:' || v_log.id::text
          when 'name-and-shirt' then 'sofascore-auto-map:name-and-shirt:' || v_log.id::text
          when 'side-shirt-position' then 'sofascore-auto-map:side-shirt-position:' || v_log.id::text
          when 'sofascore-created' then 'sofascore-auto-map:sofascore-created:' || v_log.id::text
          else 'sofascore-admin-resolve:' || v_log.id::text end;
      end if;
      if found
        and v_log.mapping_id = m.id
        and v_log.sofascore_player_id = m.external_id
        and v_log.player_id = m.internal_entity_id
        and m.source_version = v_expected
        and (v_log.method <> 'staff-resolution'
             or (m.manually_corrected and m.corrected_by is not distinct from v_log.decided_by))
        and (v_log.method = 'staff-resolution' or not m.manually_corrected) then
        v_reviewed := true;
        v_provenance := case v_log.method
          when 'exact-name' then 'automatic_exact_name'
          when 'name-and-shirt' then 'automatic_name_and_shirt'
          when 'side-shirt-position' then 'automatic_side_shirt_position'
          when 'sofascore-created' then 'automatic_sofascore_created'
          else 'staff_resolution' end;
        v_pid := v_log.id;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'mappingId', m.id,
    'provider', m.provider_name,
    'entityType', m.entity_type::text,
    'externalId', m.external_id,
    'appPlayerId', m.internal_entity_id,
    'active', m.active,
    'manuallyCorrected', m.manually_corrected,
    'reviewed', v_reviewed,
    'reviewProvenance', v_provenance,
    'provenanceProposalId', case when v_provenance = 'executed_proposal' then v_pid end,
    'correctedAt', m.corrected_at,
    'sourceVersion', m.source_version,
    'updatedAt', m.updated_at,
    -- Covers every field that makes the row what it is. Not last_seen_at or updated_at: ingestion may
    -- touch those without changing the identity.
    'stateDigest', app_private.admin_payload_fingerprint(jsonb_build_object(
      'id', m.id, 'provider', m.provider_name, 'entityType', m.entity_type::text,
      'externalId', m.external_id, 'appPlayerId', m.internal_entity_id, 'active', m.active,
      'manuallyCorrected', m.manually_corrected, 'correctedBy', m.corrected_by,
      -- Written out in UTC: jsonb prints a timestamptz in the SESSION's time zone, and a digest must not depend on it.
      'correctedAt', to_char(m.corrected_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'correctionReason', m.correction_reason,
      'sourceVersion', m.source_version, 'reviewed', v_reviewed,
      'provenanceProposalId', case when v_provenance = 'executed_proposal' then v_pid end)));
end;
$$;

-- ===========================================================================
-- 4. The service function
-- ===========================================================================
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
  v_cands uuid[]; v_other uuid[]; v_nullshirt uuid[];
  v_pick uuid; v_method text; v_reason text; v_conflict boolean;
  v_log uuid; v_mapping uuid; v_new uuid; v_new_fantasy uuid;
  v_claims text[] := '{}';
  v_pos_code text; v_price numeric; v_membership_shirt integer;
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
                           where m.provider_name = 'sofascore' and m.entity_type = 'player' and m.external_id = v_id);
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
        perform pg_advisory_xact_lock(hashtextextended('fantasy:catalog:' || f.season_id::text, 0));
        if fs.id is not null then
          perform pg_advisory_xact_lock_shared(hashtextextended('fantasy:squads:' || fs.id::text, 0));
        end if;
        v_new := gen_random_uuid();
        insert into app.players (id, slug, full_name, display_name, position, preferred_foot, active)
        values (v_new, app_private.football_catalog_slug('player', left(v_name, 120), v_new),
          v_name, left(v_name, 120), v_pos::app.football_position, 'unknown', true);
        -- A shirt number another active member of the club already wears is left blank, as the
        -- player-list update does (the club may have a stale member; staff can correct it).
        v_membership_shirt := v_shirt;
        if exists (select 1 from app.team_memberships mem
                    where mem.team_id = v_team and mem.season_id = f.season_id and mem.active
                      and mem.shirt_number = v_shirt) then
          v_membership_shirt := null;
        end if;
        insert into app.team_memberships (player_id, team_id, season_id, shirt_number, squad_role,
          valid_from, valid_to, active)
        values (v_new, v_team, f.season_id, v_membership_shirt, 'player', s.starts_on, s.ends_on, true);
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
        if fs.id is not null then
          v_pos_code := case v_pos when 'goalkeeper' then 'GK' when 'defender' then 'DEF'
                                   when 'midfielder' then 'MID' else 'FWD' end;
          -- No earlier rating: the opening catalog and the player-list update price this the same way.
          v_price := round(app_private.fantasy_initial_price_v1(v_pos_code, 6.0, 0.0), 1);
          insert into app.fantasy_players (fantasy_season_id, football_player_id, football_team_id,
            position_id, price, status, eligible, active)
          values (fs.id, v_new, v_team,
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
revoke all on function api.service_sofascore_auto_map_players(uuid, jsonb) from public, anon, authenticated;
grant execute on function api.service_sofascore_auto_map_players(uuid, jsonb) to service_role;
comment on function api.service_sofascore_auto_map_players(uuid, jsonb) is
  'Service role: maps a SofaScore player to the one squad member of the right club with his shirt number and a compatible position, creates the player (membership, mapping, priced Fantasy pool entry) when the catalog has nobody for him, and queues the ambiguous rest for staff with the candidates pre-filled. Never compares names. Never changes an existing mapping.';
$migration$]);
do $apply$
declare source text;
begin
  select statements[1] into source from supabase_migrations.schema_migrations where version='20261013150000';
  if encode(sha256(convert_to(source,'UTF8')),'hex')
    is distinct from '2e428c489a176b24d2c217d1ae2e8b8cf4e09829c7cfb65752ca3258c6dbefc7'
  then raise exception 'stop: migration differs from reviewed repository bytes'; end if;
  execute source;
end $apply$;
do $verify$
begin
  if md5((select prosrc from pg_proc where oid='api.service_sofascore_auto_map_players(uuid,jsonb)'::regprocedure))
       is distinct from 'f73d3f889417c3c664267049976d264e'
    or md5((select prosrc from pg_proc where oid='app_private.football_mapping_supporting_state(uuid)'::regprocedure))
       is distinct from '8dcffad06bbf9e6b5db59e6fd79b6fc6'
    or md5((select prosrc from pg_proc where oid='app_private.sofascore_position_compatible(text,text)'::regprocedure))
       is distinct from 'f564d8102c194997d9c2e524b7cb77c7'
  then raise exception 'stop: a function body differs from the reviewed migration'; end if;
  if has_function_privilege('anon','api.service_sofascore_auto_map_players(uuid,jsonb)','execute')
    or has_function_privilege('authenticated','api.service_sofascore_auto_map_players(uuid,jsonb)','execute')
    or not has_function_privilege('service_role','api.service_sofascore_auto_map_players(uuid,jsonb)','execute')
    or has_function_privilege('anon','app_private.football_mapping_supporting_state(uuid)','execute')
    or has_function_privilege('authenticated','app_private.football_mapping_supporting_state(uuid)','execute')
    or has_function_privilege('service_role','app_private.football_mapping_supporting_state(uuid)','execute')
    or has_function_privilege('service_role','app_private.sofascore_position_compatible(text,text)','execute')
  then raise exception 'stop: permissions differ from the reviewed migration'; end if;
  -- The migration creates objects and replaces functions only: nothing was written.
  if exists(select 1 from automatch_before b where
       (select count(*) from app_private.football_provider_mappings where provider_name='sofascore' and entity_type='player') <> b.mappings
    or (select md5(string_agg(m.id::text||m.internal_entity_id::text||m.active::text||coalesce(m.source_version,''), ',' order by m.id))
          from app_private.football_provider_mappings m where m.provider_name='sofascore' and m.entity_type='player') is distinct from b.mapping_digest
    or (select count(*) from app_private.sofascore_player_match_log) <> b.log_rows
    or (select count(*) from app_private.sofascore_player_match_queue) <> b.queue_rows
    or (select count(*) from app.players) <> b.players
    or (select count(*) from app.fantasy_players) <> b.pool)
  then raise exception 'stop: data changed in a way the migration does not do'; end if;
  -- The new reasons and methods are accepted by their constraints (the old ones stay valid), and a
  -- queue entry may have no side.
  if not exists(select 1 from pg_constraint where conname='sofascore_player_match_queue_reason_check'
                 and pg_get_constraintdef(oid) like '%weak_match%' and pg_get_constraintdef(oid) like '%duplicate_name_in_squad%')
    or not exists(select 1 from pg_constraint where conname='sofascore_player_match_log_method_check'
                 and pg_get_constraintdef(oid) like '%sofascore-created%' and pg_get_constraintdef(oid) like '%exact-name%')
    or exists(select 1 from pg_attribute where attrelid='app_private.sofascore_player_match_queue'::regclass
               and attname='side' and attnotnull)
  then raise exception 'stop: a constraint differs from the reviewed migration'; end if;
end $verify$;
-- What stays queued under an old (name-based) reason until the player is next seen.
select q.reason, count(*) as open_entries
  from app_private.sofascore_player_match_queue q
 where q.resolved_at is null
 group by q.reason order by q.reason;
rollback;
