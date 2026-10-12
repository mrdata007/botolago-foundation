-- SofaScore player auto-matching decides by side, shirt number and position, never by name
-- (docs/backend/SOFASCORE_PLAYER_MATCHING.md).
--
-- WHY. The owner decided that a name must not decide who a SofaScore player is. Names are
-- spelled differently by every provider, and a shared name or a shared last name is exactly
-- how one person's points land on another. A shirt number inside one club's squad on one
-- day is a far stronger key, and it is the same key the unmapped-substitute exclusion check
-- (api.service_record_sofascore_fantasy_observation) already uses.
--
-- THE RULE. For a SofaScore player with no mapping, on one side of one fixture:
--   candidate = an app player with an active membership in that side's club for the fixture's
--               season (valid on the kickoff date), with NO active SofaScore mapping, whose
--               membership shirt number equals the lineup shirt number, and whose position is
--               compatible (equal; neighbouring lines defender-midfielder or midfielder-forward;
--               or either one unknown; a goalkeeper only with a goalkeeper).
--   exactly one candidate, and the same pairing (SofaScore id, candidate) seen in at least
--   AUTOMATCH_MIN_MATCHES distinct fixtures (2) with no conflicting sighting
--       -> linked automatically, method 'side-shirt-position'.
--   anything else -> queued for staff with a reason and the candidate(s) pre-filled:
--       awaiting_second_match  one candidate, seen in fewer fixtures than the minimum
--       ambiguous_shirt        two or more candidates
--       no_shirt               the lineup has no shirt number for him
--       no_candidate           nobody in the squad has that shirt number
--       position_mismatch      the shirt number exists, but only with an incompatible position
--       shirt_conflict         the sightings disagree: he was paired with another player, or
--                              another SofaScore id is paired with the same player
--       candidate_already_mapped / inactive_mapping_exists   as before
--   The names in the lineup are stored for display and evidence only; nothing here compares one.
--
-- WHAT THIS MIGRATION CHANGES.
--   1. app_private.sofascore_player_sightings   one row per (SofaScore id, candidate, fixture)
--      seen with exactly one candidate: "seen in N matches" is a count of these rows.
--   2. sofascore_player_match_log_method_check  also allows 'side-shirt-position'.
--   3. sofascore_player_match_queue_reason_check also allows the new reasons. Every old value
--      stays valid: rows already queued keep their reason until the player is next seen.
--   4. app_private.football_mapping_supporting_state  (replaced) also accepts a log row of
--      method 'side-shirt-position' as a review proof, reporting reviewProvenance
--      'automatic_side_shirt_position'. Everything else in it is byte for byte the version of
--      20261011130000. The earlier methods stay valid for the mappings already made.
--      The Flashscore supporting-evidence check is unchanged: it still accepts only an
--      executed, person-approved proposal.
--   5. api.service_sofascore_auto_map_players  (replaced) with the rule above. Signature,
--      grants, return shape ({mapped, queued, conflicts}), advisory lock and idempotency as in
--      20261011130000. A re-run of the same fixture adds no sighting and changes no mapping.
--      A link made here also sets the club's finished matches that wait on a player identity to be
--      tried on the next tick (app_private.sofascore_fantasy_reopen), as staff resolution does.
--   Staff resolution (api.admin_resolve_sofascore_player_match, with the hands-off reopen of
--   20261012120000) is not touched: confirming a pre-filled candidate is one click.
--
-- Applying it writes no data: no mapping is created, changed or removed here.
--
-- Prerequisites: 20261011130000 (the function replaced) and 20261012120000 (hands-off).
do $$
begin
  if to_regprocedure('api.service_sofascore_auto_map_players(uuid,jsonb)') is null
    or to_regclass('app_private.sofascore_player_match_log') is null
    or to_regclass('app_private.sofascore_player_match_queue') is null
    or to_regprocedure('app_private.football_mapping_supporting_state(uuid)') is null
    or to_regprocedure('app_private.sofascore_fantasy_reopen(uuid,uuid)') is null then
    raise exception 'sofascore_automatch_prerequisite_missing: apply migrations 20261011130000 and 20261012120000 first';
  end if;
end $$;

-- ===========================================================================
-- 1. The constant, the position rule and the sightings
-- ===========================================================================
-- AUTOMATCH_MIN_MATCHES: how many distinct fixtures must show the same pairing before it is linked.
create function app_private.sofascore_automatch_min_matches()
returns integer language sql immutable set search_path = '' as $$ select 2 $$;
revoke all on function app_private.sofascore_automatch_min_matches() from public, anon, authenticated, service_role;

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

create table app_private.sofascore_player_sightings (
  sofascore_player_id text not null,
  player_id uuid not null references app.players(id) on delete cascade,
  fixture_id uuid not null references app.fixtures(id) on delete cascade,
  side text not null,
  shirt_number integer not null,
  seen_at timestamptz not null default statement_timestamp(),
  primary key (sofascore_player_id, player_id, fixture_id),
  constraint sofascore_player_sightings_id_check
    check (sofascore_player_id = btrim(sofascore_player_id) and char_length(sofascore_player_id) between 1 and 200),
  constraint sofascore_player_sightings_side_check check (side in ('home', 'away'))
);
create index sofascore_player_sightings_player_idx on app_private.sofascore_player_sightings (player_id);
create index sofascore_player_sightings_fixture_idx on app_private.sofascore_player_sightings (fixture_id);
alter table app_private.sofascore_player_sightings enable row level security;
alter table app_private.sofascore_player_sightings force row level security;
revoke all on table app_private.sofascore_player_sightings from public, anon, authenticated, service_role;

-- ===========================================================================
-- 2. Constraints: one more method, more reasons (the old values stay valid)
-- ===========================================================================
alter table app_private.sofascore_player_match_log drop constraint sofascore_player_match_log_method_check;
alter table app_private.sofascore_player_match_log add constraint sofascore_player_match_log_method_check
  check (method in ('exact-name', 'name-and-shirt', 'staff-resolution', 'side-shirt-position'));

alter table app_private.sofascore_player_match_queue drop constraint sofascore_player_match_queue_reason_check;
alter table app_private.sofascore_player_match_queue add constraint sofascore_player_match_queue_reason_check
  check (reason in (
    'no_candidate', 'ambiguous_name', 'partial_name', 'candidate_already_mapped',
    'inactive_mapping_exists', 'position_mismatch', 'duplicate_name_in_squad',
    'awaiting_second_match', 'ambiguous_shirt', 'no_shirt', 'shirt_conflict'));

-- ===========================================================================
-- 3. "Reviewed", with the third automatic proof
-- ===========================================================================
-- Identical to the 20261011130000 version, except that the log branch also knows
-- 'side-shirt-position' (source_version 'sofascore-auto-map:side-shirt-position:<log id>').
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
      '^sofascore-(auto-map:exact-name|auto-map:name-and-shirt|auto-map:side-shirt-position|admin-resolve):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
    if v_parts is not null then
      select * into v_log from app_private.sofascore_player_match_log where id = v_parts[2]::uuid;
      if found then
        v_expected := case v_log.method
          when 'exact-name' then 'sofascore-auto-map:exact-name:' || v_log.id::text
          when 'name-and-shirt' then 'sofascore-auto-map:name-and-shirt:' || v_log.id::text
          when 'side-shirt-position' then 'sofascore-auto-map:side-shirt-position:' || v_log.id::text
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
  p jsonb;
  v_id text; v_side text; v_name text; v_short text; v_pos text;
  v_shirt integer; v_appeared boolean; v_team uuid;
  v_existing app_private.football_provider_mappings%rowtype;
  v_cands uuid[]; v_same_shirt uuid[]; v_other uuid[];
  v_pick uuid; v_reason text; v_conflict boolean; v_matches integer;
  v_log uuid; v_mapping uuid;
  v_mapped jsonb := '[]'::jsonb; v_queued integer := 0; v_conflicts integer := 0;
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

  -- One matcher at a time: two calls for the same players cannot interleave.
  perform pg_advisory_xact_lock(hashtextextended('sofascore-player-auto-map', 0));

  -- Pass 1: record what this fixture shows, for every unmapped player with exactly one
  -- candidate, BEFORE anyone is decided. Two SofaScore ids pointing at one player in this very
  -- fixture are then both visible as a conflict, whichever comes first in the list.
  for p in select value from jsonb_array_elements(p_players) loop
    v_id := p ->> 'sofascorePlayerId';
    v_side := p ->> 'side';
    v_shirt := case when jsonb_typeof(p -> 'shirtNumber') = 'number'
                     and (p ->> 'shirtNumber') ~ '^[0-9]{1,2}$' then (p ->> 'shirtNumber')::integer end;
    v_pos := case p ->> 'position' when 'G' then 'goalkeeper' when 'D' then 'defender'
                                   when 'M' then 'midfielder' when 'F' then 'forward' end;
    v_team := case v_side when 'home' then f.home_team_id else f.away_team_id end;
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
      insert into app_private.sofascore_player_sightings (sofascore_player_id, player_id, fixture_id, side, shirt_number)
      values (v_id, v_cands[1], f.id, v_side, v_shirt)
      on conflict do nothing;
    end if;
  end loop;

  -- Pass 2: decide.
  for p in select value from jsonb_array_elements(p_players) loop
    v_id := p ->> 'sofascorePlayerId';
    v_side := p ->> 'side';
    v_name := btrim(p ->> 'name');      -- display and evidence only; never compared
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

    v_cands := '{}'; v_pick := null; v_reason := null; v_conflict := false;
    if v_shirt is null then
      v_reason := 'no_shirt';
    else
      -- Candidates: this club's squad on match day, this shirt number, a compatible position, and no
      -- active SofaScore mapping. Squad members with this shirt but an incompatible position are
      -- kept apart, to explain a refusal and to pre-fill the review.
      select coalesce(array_agg(distinct pl.id) filter (where
               app_private.sofascore_position_compatible(pl.position::text, v_pos)), '{}'),
             coalesce(array_agg(distinct pl.id) filter (where
               not app_private.sofascore_position_compatible(pl.position::text, v_pos)), '{}')
        into v_cands, v_other
        from app.team_memberships mem
        join app.players pl on pl.id = mem.player_id
       where mem.team_id = v_team and mem.season_id = f.season_id and mem.active
         and mem.valid_from <= f.kickoff_at::date
         and (mem.valid_to is null or mem.valid_to >= f.kickoff_at::date)
         and mem.shirt_number = v_shirt
         and not exists (select 1 from app_private.football_provider_mappings m
                          where m.provider_name = 'sofascore' and m.entity_type = 'player'
                            and m.internal_entity_id = pl.id and m.active);
      if cardinality(v_cands) = 0 then
        if cardinality(v_other) > 0 then
          v_reason := 'position_mismatch'; v_cands := v_other;
        else
          v_reason := 'no_candidate';
        end if;
      elsif cardinality(v_cands) > 1 then
        v_reason := 'ambiguous_shirt';
      else
        -- One candidate. Do the sightings agree, and are there enough of them?
        v_same_shirt := v_cands;
        if exists (select 1 from app_private.sofascore_player_sightings s
                    where s.sofascore_player_id = v_id and s.player_id <> v_cands[1])
          or exists (select 1 from app_private.sofascore_player_sightings s
                      where s.player_id = v_cands[1] and s.sofascore_player_id <> v_id
                        and not exists (select 1 from app_private.football_provider_mappings m
                                         where m.provider_name = 'sofascore' and m.entity_type = 'player'
                                           and m.external_id = s.sofascore_player_id and m.active)) then
          v_reason := 'shirt_conflict';
          select coalesce(array_agg(distinct x), '{}') into v_cands from (
            select unnest(v_same_shirt) as x
            union
            select s.player_id from app_private.sofascore_player_sightings s
             where s.sofascore_player_id = v_id) u;
          v_conflict := true;
        else
          select count(distinct s.fixture_id)::integer into v_matches
            from app_private.sofascore_player_sightings s
           where s.sofascore_player_id = v_id and s.player_id = v_cands[1];
          if v_matches >= app_private.sofascore_automatch_min_matches() then
            v_pick := v_cands[1];
          else
            v_reason := 'awaiting_second_match';
          end if;
        end if;
      end if;
    end if;

    -- The chosen player must not already carry another SofaScore id (an inactive one included).
    if v_pick is not null and exists (
         select 1 from app_private.football_provider_mappings m
          where m.provider_name = 'sofascore' and m.entity_type = 'player' and m.internal_entity_id = v_pick) then
      v_reason := 'candidate_already_mapped'; v_cands := array[v_pick]; v_pick := null; v_conflict := true;
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
          'sofascoreName', v_name, 'shirtNumber', v_shirt, 'position', v_pos, 'side', v_side, 'teamId', v_team,
          'matches', v_matches, 'minMatches', app_private.sofascore_automatch_min_matches()));
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

  -- A club that gained a link this call: its finished matches that wait on a player identity are
  -- tried again on the next tick, as when staff match a player (20261012120000). Without this, a
  -- new player's first match would wait for the retry back-off, or be given up, before his
  -- second match links him.
  if v_linked_home then perform app_private.sofascore_fantasy_reopen(f.home_team_id, null); end if;
  if v_linked_away then perform app_private.sofascore_fantasy_reopen(f.away_team_id, null); end if;

  return jsonb_build_object('mapped', v_mapped, 'queued', v_queued, 'conflicts', v_conflicts);
end $$;
revoke all on function api.service_sofascore_auto_map_players(uuid, jsonb) from public, anon, authenticated;
grant execute on function api.service_sofascore_auto_map_players(uuid, jsonb) to service_role;
comment on function api.service_sofascore_auto_map_players(uuid, jsonb) is
  'Service role: maps a SofaScore player to a BotolaGO player only when exactly one squad member of the right side has his shirt number and a compatible position, and the same pairing was seen in at least two fixtures with no conflicting sighting; queues every other one for staff with the candidates pre-filled. Never compares names. Never changes an existing mapping.';
