-- Automatic SofaScore player matching (docs/backend/SOFASCORE_PLAYER_MATCHING.md).
--
-- Fantasy points come from SofaScore alone, and every SofaScore player on a
-- match must be an active, REVIEWED SofaScore player mapping
-- (api.service_record_sofascore_fantasy_observation). Reviewing each player by
-- hand stalls the points, so this migration lets the service match the safe
-- cases by itself and leaves every doubtful one on a short list for the owner.
--
-- What it adds:
--   * app_private.sofascore_player_match_log    one row per match made here, automatic or by staff
--   * app_private.sofascore_player_match_queue  the doubtful ones, one row per SofaScore player id
--   * api.service_sofascore_auto_map_players    service role: maps the safe cases, queues the rest
--   * api.admin_sofascore_player_match_queue    staff: the open list
--   * api.admin_resolve_sofascore_player_match  staff: pick the right player for one entry
--   * a second way for a mapping to count as "reviewed" (see below)
--
-- What "reviewed" means, and what changes. app_private.football_mapping_supporting_state
-- (migration 20261003120000) called a mapping reviewed only when an EXECUTED,
-- two-person mapping proposal wrote it. That stays true and is checked exactly as
-- before. This migration adds one more proof: the mapping's source_version names a
-- row in sofascore_player_match_log, and that row agrees with the mapping on
-- SofaScore id, player and method. A marker string on its own proves nothing; the
-- log row has to exist and match. The state reports which proof held in
-- 'reviewProvenance': 'executed_proposal' (as before), 'automatic_exact_name',
-- 'automatic_name_and_shirt' or 'staff_resolution'.
--
-- The Flashscore supporting-evidence check (football_mapping_supporting_dependency)
-- keeps its old meaning: it still accepts only 'executed_proposal'. An automatic
-- match is good enough to score a SofaScore player, not to vouch for a second
-- provider's identity.
--
-- Nothing is overwritten. An existing mapping, active or not, is never changed,
-- reactivated or moved; a conflict goes to the list. Undo an automatic match by
-- deactivating its mapping (source_version starts with 'sofascore-auto-map:').
--
-- Prerequisites: 20261003120000 (the state function), 20260925200000 (person_name_key),
-- 20261011120000 (the Fantasy function that asks for reviewed mappings).
do $$
begin
  if to_regprocedure('app_private.football_mapping_supporting_state(uuid)') is null
    or to_regprocedure('app_private.football_mapping_supporting_dependency(text,uuid,uuid)') is null
    or to_regprocedure('app_private.person_name_key(text)') is null
    or to_regprocedure('api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)') is null then
    raise exception 'sofascore_auto_map_prerequisite_missing: apply migrations 20260925200000, 20261003120000 and 20261011120000 first';
  end if;
end $$;

-- ===========================================================================
-- 1. The audit log and the review queue
-- ===========================================================================
create table app_private.sofascore_player_match_log (
  id uuid primary key default gen_random_uuid(),
  method text not null,
  mapping_id uuid not null,
  sofascore_player_id text not null,
  player_id uuid not null references app.players(id) on delete restrict,
  fixture_id uuid references app.fixtures(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  constraint sofascore_player_match_log_method_check
    check (method in ('exact-name', 'name-and-shirt', 'staff-resolution')),
  constraint sofascore_player_match_log_external_check
    check (sofascore_player_id = btrim(sofascore_player_id) and char_length(sofascore_player_id) between 1 and 200),
  constraint sofascore_player_match_log_staff_check
    check ((method = 'staff-resolution') = (decided_by is not null))
);
create index sofascore_player_match_log_mapping_idx on app_private.sofascore_player_match_log (mapping_id);
create index sofascore_player_match_log_player_idx on app_private.sofascore_player_match_log (player_id);
alter table app_private.sofascore_player_match_log enable row level security;
alter table app_private.sofascore_player_match_log force row level security;
revoke all on table app_private.sofascore_player_match_log from public, anon, authenticated, service_role;

create table app_private.sofascore_player_match_queue (
  sofascore_player_id text primary key,
  fixture_id uuid references app.fixtures(id) on delete set null,
  team_id uuid references app.teams(id) on delete set null,
  side text not null,
  name text not null,
  short_name text,
  shirt_number integer,
  position text,
  reason text not null,
  candidate_player_ids uuid[] not null default '{}',
  first_seen_at timestamptz not null default statement_timestamp(),
  last_seen_at timestamptz not null default statement_timestamp(),
  times_seen integer not null default 1,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_player_id uuid references app.players(id) on delete restrict,
  constraint sofascore_player_match_queue_id_check
    check (sofascore_player_id = btrim(sofascore_player_id) and char_length(sofascore_player_id) between 1 and 200),
  constraint sofascore_player_match_queue_side_check check (side in ('home', 'away')),
  constraint sofascore_player_match_queue_reason_check check (reason in (
    'no_candidate', 'ambiguous_name', 'partial_name', 'candidate_already_mapped',
    'inactive_mapping_exists', 'position_mismatch', 'duplicate_name_in_squad')),
  constraint sofascore_player_match_queue_times_check check (times_seen >= 1),
  constraint sofascore_player_match_queue_resolved_check
    check ((resolved_at is null) = (resolved_player_id is null))
);
create index sofascore_player_match_queue_open_idx
  on app_private.sofascore_player_match_queue (last_seen_at desc) where resolved_at is null;
alter table app_private.sofascore_player_match_queue enable row level security;
alter table app_private.sofascore_player_match_queue force row level security;
revoke all on table app_private.sofascore_player_match_queue from public, anon, authenticated, service_role;

-- ===========================================================================
-- 2. "Reviewed", with the second proof
-- ===========================================================================
-- Identical to the 20261003120000 version, except for the log branch.
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

  -- Second proof: this migration's own log. The source_version must be exactly what the
  -- log row says it should be, and the log row must agree with the mapping.
  if not v_reviewed and m.provider_name = 'sofascore' and m.entity_type = 'player' then
    v_parts := regexp_match(coalesce(m.source_version, ''),
      '^sofascore-(auto-map:exact-name|auto-map:name-and-shirt|admin-resolve):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
    if v_parts is not null then
      select * into v_log from app_private.sofascore_player_match_log where id = v_parts[2]::uuid;
      if found then
        v_expected := case v_log.method
          when 'exact-name' then 'sofascore-auto-map:exact-name:' || v_log.id::text
          when 'name-and-shirt' then 'sofascore-auto-map:name-and-shirt:' || v_log.id::text
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

-- The supporting-evidence check for other providers keeps requiring a person-approved proposal.
create or replace function app_private.football_mapping_supporting_dependency(
  p_evidence_class text,
  p_supporting_mapping uuid,
  p_target uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s jsonb;
begin
  if p_evidence_class is null or p_supporting_mapping is null then
    return app_private.football_mapping_refuse('supporting_dependency_required');
  end if;
  if p_evidence_class not in ('F1_REVIEWED_SOFASCORE_EVENTS', 'F2_REVIEWED_SOFASCORE_SHIRT_DOB') then
    return app_private.football_mapping_refuse('supporting_dependency_invalid');
  end if;
  s := app_private.football_mapping_supporting_state(p_supporting_mapping);
  if s is null then
    return app_private.football_mapping_refuse('supporting_mapping_missing');
  end if;
  if s ->> 'provider' <> 'sofascore' or s ->> 'entityType' <> 'player' then
    return app_private.football_mapping_refuse('supporting_mapping_not_sofascore');
  end if;
  if not (s ->> 'active')::boolean then
    return app_private.football_mapping_refuse('supporting_mapping_inactive');
  end if;
  if not (s ->> 'reviewed')::boolean or s ->> 'reviewProvenance' is distinct from 'executed_proposal' then
    return app_private.football_mapping_refuse('supporting_mapping_unreviewed');
  end if;
  if (s ->> 'appPlayerId')::uuid is distinct from p_target then
    return app_private.football_mapping_refuse('supporting_mapping_target_mismatch');
  end if;
  return jsonb_build_object('ok', true, 'supporting', jsonb_build_object(
    'mappingId', s -> 'mappingId', 'provider', s -> 'provider', 'externalId', s -> 'externalId',
    'appPlayerId', s -> 'appPlayerId', 'active', true, 'reviewed', true,
    'reviewProvenance', s -> 'reviewProvenance', 'provenanceProposalId', s -> 'provenanceProposalId',
    'stateDigest', s -> 'stateDigest', 'evidenceClass', p_evidence_class));
end;
$$;

-- ===========================================================================
-- 3. Queueing helper (internal)
-- ===========================================================================
create function app_private.sofascore_player_match_enqueue(
  p_sofascore_player_id text, p_fixture_id uuid, p_team_id uuid, p_side text, p_name text,
  p_short_name text, p_shirt integer, p_position text, p_reason text, p_candidates uuid[])
returns void language sql security definer set search_path = '' as $$
  insert into app_private.sofascore_player_match_queue as q (
    sofascore_player_id, fixture_id, team_id, side, name, short_name, shirt_number, position,
    reason, candidate_player_ids)
  values (p_sofascore_player_id, p_fixture_id, p_team_id, p_side, p_name, p_short_name, p_shirt,
    p_position, p_reason, coalesce(p_candidates, '{}'))
  on conflict (sofascore_player_id) do update set
    fixture_id = excluded.fixture_id, team_id = excluded.team_id, side = excluded.side,
    name = excluded.name, short_name = excluded.short_name, shirt_number = excluded.shirt_number,
    position = excluded.position, reason = excluded.reason,
    candidate_player_ids = excluded.candidate_player_ids,
    last_seen_at = statement_timestamp(), times_seen = q.times_seen + 1,
    -- A resolved entry that comes back unmapped (its mapping was deactivated) is open again.
    resolved_at = null, resolved_by = null, resolved_player_id = null
$$;
revoke all on function app_private.sofascore_player_match_enqueue(text, uuid, uuid, text, text, text, integer, text, text, uuid[])
  from public, anon, authenticated, service_role;

-- ===========================================================================
-- 4. The service function
-- ===========================================================================
create function api.service_sofascore_auto_map_players(p_fixture_id uuid, p_players jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f app.fixtures%rowtype;
  p jsonb;
  v_id text; v_side text; v_name text; v_short text; v_pos text;
  v_shirt integer; v_appeared boolean; v_team uuid; v_key text; v_last text;
  v_existing app_private.football_provider_mappings%rowtype;
  v_cands uuid[]; v_exact uuid[]; v_partial uuid[]; v_shirtm uuid[];
  v_pick uuid; v_method text; v_reason text; v_conflict boolean;
  v_log uuid; v_mapping uuid;
  v_mapped jsonb := '[]'::jsonb; v_queued integer := 0; v_conflicts integer := 0;
  v_dup_keys text[];
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

  -- Two SofaScore players on one side with the same normalised name can never be told apart by name.
  select coalesce(array_agg(k), '{}') into v_dup_keys from (
    select (e.value ->> 'side') || '|' || app_private.person_name_key(e.value ->> 'name') as k
      from jsonb_array_elements(p_players) e
     where app_private.person_name_key(e.value ->> 'name') is not null
     group by 1 having count(distinct e.value ->> 'sofascorePlayerId') > 1) d;

  for p in select value from jsonb_array_elements(p_players) loop
    v_id := p ->> 'sofascorePlayerId';
    v_side := p ->> 'side';
    v_name := btrim(p ->> 'name');
    v_short := nullif(btrim(coalesce(p ->> 'shortName', '')), '');
    v_shirt := case when jsonb_typeof(p -> 'shirtNumber') = 'number'
                     and (p ->> 'shirtNumber') ~ '^[0-9]{1,2}$' then (p ->> 'shirtNumber')::integer end;
    v_pos := case p ->> 'position' when 'G' then 'goalkeeper' when 'D' then 'defender'
                                   when 'M' then 'midfielder' when 'F' then 'forward' end;
    v_appeared := coalesce((p ->> 'appeared')::boolean, false);
    v_team := case v_side when 'home' then f.home_team_id else f.away_team_id end;
    v_key := app_private.person_name_key(v_name);
    v_last := case when v_key is null then null else (regexp_match(v_key, '([^ ]+)$'))[1] end;

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

    -- Squad members of that team at kickoff, with every spelling of their name.
    v_exact := '{}'; v_partial := '{}'; v_shirtm := '{}'; v_pick := null; v_method := null; v_reason := null;
    v_conflict := false;
    if v_key is not null and not ((v_side || '|' || v_key) = any (v_dup_keys)) then
      select coalesce(array_agg(c.player_id) filter (where c.name_hit), '{}'),
             coalesce(array_agg(c.player_id) filter (where c.last_hit and not c.name_hit), '{}'),
             coalesce(array_agg(c.player_id) filter (where c.last_hit and v_shirt is not null
                                                       and c.shirt_number = v_shirt), '{}')
        into v_exact, v_partial, v_shirtm
        from (
          select pl.id as player_id, mem.shirt_number,
                 (v_key = any (k.keys)) as name_hit,
                 (v_last = any (k.lasts)) as last_hit
            from app.team_memberships mem
            join app.players pl on pl.id = mem.player_id
            cross join lateral (
              select array_remove(array[
                  app_private.person_name_key(pl.full_name),
                  app_private.person_name_key(concat_ws(' ', pl.first_name, pl.last_name)),
                  case when app_private.person_name_key(pl.display_name) like '% %'
                       then app_private.person_name_key(pl.display_name) end], null) as keys,
                array_remove(array[
                  (regexp_match(app_private.person_name_key(pl.full_name), '([^ ]+)$'))[1],
                  (regexp_match(app_private.person_name_key(concat_ws(' ', pl.first_name, pl.last_name)), '([^ ]+)$'))[1],
                  (regexp_match(app_private.person_name_key(pl.display_name), '([^ ]+)$'))[1]], null) as lasts) k
           where mem.team_id = v_team and mem.season_id = f.season_id and mem.active
             and mem.valid_from <= f.kickoff_at::date
             and (mem.valid_to is null or mem.valid_to >= f.kickoff_at::date)
        ) c;
    end if;

    if v_key is null or v_side || '|' || coalesce(v_key, '') = any (v_dup_keys) then
      v_reason := 'duplicate_name_in_squad';
      v_cands := '{}';
    elsif cardinality(v_exact) = 1 then
      v_pick := v_exact[1]; v_method := 'exact-name';
    elsif cardinality(v_exact) > 1 then
      v_reason := 'ambiguous_name'; v_cands := v_exact;
    elsif cardinality(v_shirtm) = 1 then
      -- Same last name and same shirt number, and no exact name hit. The position must not disagree.
      if v_pos is not null and exists (select 1 from app.players pl
            where pl.id = v_shirtm[1] and pl.position::text <> v_pos) then
        v_reason := 'position_mismatch'; v_cands := v_shirtm;
      else
        v_pick := v_shirtm[1]; v_method := 'name-and-shirt';
      end if;
    elsif cardinality(v_partial) > 0 then
      v_reason := 'partial_name'; v_cands := v_partial;
    else
      v_reason := 'no_candidate'; v_cands := '{}';
    end if;

    -- The chosen player must not already carry another SofaScore id (active or not).
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
        'sofascore-auto-map:' || v_method || ':' || v_log::text, statement_timestamp(), true, false)
      on conflict do nothing
      returning id into v_mapping;
      if v_mapping is not null then
        insert into app_private.sofascore_player_match_log (id, method, mapping_id, sofascore_player_id,
          player_id, fixture_id, evidence)
        values (v_log, v_method, v_mapping, v_id, v_pick, f.id, jsonb_build_object(
          'sofascoreName', v_name, 'shirtNumber', v_shirt, 'position', v_pos, 'side', v_side, 'teamId', v_team));
        v_mapped := v_mapped || jsonb_build_array(jsonb_build_object('sofascorePlayerId', v_id, 'playerId', v_pick));
        update app_private.sofascore_player_match_queue
           set resolved_at = statement_timestamp(), resolved_player_id = v_pick
         where sofascore_player_id = v_id and resolved_at is null;
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

  return jsonb_build_object('mapped', v_mapped, 'queued', v_queued, 'conflicts', v_conflicts);
end $$;
revoke all on function api.service_sofascore_auto_map_players(uuid, jsonb) from public, anon, authenticated;
grant execute on function api.service_sofascore_auto_map_players(uuid, jsonb) to service_role;
comment on function api.service_sofascore_auto_map_players(uuid, jsonb) is
  'Service role: maps SofaScore players to BotolaGO players only on an exact, unambiguous name (or last name plus shirt number); queues every doubtful one for staff. Never changes an existing mapping.';

-- ===========================================================================
-- 5. Staff: read the list, resolve one
-- ===========================================================================
create function api.admin_sofascore_player_match_queue()
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
      'candidates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'playerId', pl.id, 'fullName', pl.full_name, 'displayName', pl.display_name,
          'position', pl.position::text,
          'shirtNumber', (select mem.shirt_number from app.team_memberships mem
                           where mem.player_id = pl.id and mem.team_id = q.team_id and mem.active
                           order by mem.valid_from desc limit 1),
          'mappedToSofascoreId', (select m.external_id from app_private.football_provider_mappings m
                                   where m.provider_name = 'sofascore' and m.entity_type = 'player'
                                     and m.internal_entity_id = pl.id limit 1)) order by pl.full_name)
        from app.players pl where pl.id = any (q.candidate_player_ids)), '[]'::jsonb))
      order by q.last_seen_at desc, q.sofascore_player_id)
    from (select * from app_private.sofascore_player_match_queue where resolved_at is null
           order by last_seen_at desc, sofascore_player_id limit 500) q
    left join app.teams t on t.id = q.team_id), '[]'::jsonb);
end $$;

create function api.admin_resolve_sofascore_player_match(p_sofascore_player_id text, p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_principal uuid := app_private.admin_assert_permission('football.manage_mappings');
  v_user uuid;
  q app_private.sofascore_player_match_queue%rowtype;
  v_log uuid := gen_random_uuid();
  v_mapping uuid;
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
  if exists (select 1 from app_private.football_provider_mappings m
              where m.provider_name = 'sofascore' and m.entity_type = 'player'
                and (m.external_id = p_sofascore_player_id or m.internal_entity_id = p_player_id)) then
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
  return jsonb_build_object('sofascorePlayerId', p_sofascore_player_id, 'playerId', p_player_id,
    'mappingId', v_mapping, 'alreadyResolved', false);
end $$;

revoke all on function api.admin_sofascore_player_match_queue(), api.admin_resolve_sofascore_player_match(text, uuid)
  from public, anon, service_role;
grant execute on function api.admin_sofascore_player_match_queue(), api.admin_resolve_sofascore_player_match(text, uuid)
  to authenticated;
comment on function api.admin_sofascore_player_match_queue() is
  'Staff (football.read_operations or football.manage_mappings, AAL2): the open list of SofaScore players that could not be matched safely.';
comment on function api.admin_resolve_sofascore_player_match(text, uuid) is
  'Staff (football.manage_mappings, AAL2): maps one queued SofaScore player to the chosen player as a reviewed mapping. Refuses any conflict.';
