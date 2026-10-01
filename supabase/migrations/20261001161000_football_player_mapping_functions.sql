-- BotolaGO Production V2
-- Player-identity mapping workflow, part 2 of 2: the trusted functions.
-- Needs 20261001150000 (providers) and 20261001160000 (tables).
-- Design: docs/backend/FANTASY_PLAYER_MAPPING_TABLE_AND_REVIEW_SCREEN_DESIGN.md
--
-- EVERY durable decision (map, replace, deactivate, reactivate, ignore,
-- reverse_ignore) goes through the same path and nothing shortcuts it:
--
--   api.admin_football_mapping_propose        a human proposer (football.manage_mappings,
--                                             AAL2, recent authentication)
--   api.admin_football_mapping_decide         a DIFFERENT human approves or rejects the
--                                             exact fingerprint (same strength of login)
--   api.admin_football_mapping_execute        written once, in one guarded transaction
--   api.admin_football_mapping_cancel         the proposer withdraws
--   api.admin_football_mapping_add_position_note / _refresh_evidence
--                                             the two ways out of a held state
--   api.admin_football_mapping_*  (reads)     candidates, proposals, app-player options,
--                                             reviewer availability
--   api.football_mapping_record_observations  trusted builder write (service_role only)
--   api.football_mapping_expire_proposals     trusted sweeper (service_role only)
--   api.football_mapping_purge_display_names  90-day name purge (service_role only)
--
-- THE MAPPING TABLE HOLDS CURRENT STATE. A replacement UPDATES the existing row
-- (its two unique constraints are unconditional, so a deactivated row still
-- holds its provider id and its app player); deactivate sets active = false on
-- that row; reactivate reuses it; only `map` inserts, and only when no row
-- holds either identity. History is the proposal record (executed_before /
-- executed_after) and app_private.admin_audit_events, never the mutable row.
-- These functions touch only entity_type = 'player' rows of sofascore and
-- flashscore: a sportsmonks mapping or any other entity can never be changed.
--
-- SHARED PROVIDER IDS. One provider id is one candidate, whatever number of
-- squads it was observed in; each squad is a separate observation. That is
-- shown as the flag MULTI_SQUAD_OBSERVATION and nothing else: it is never a
-- transfer, a duplicate, a wrong squad or a collision, and it never lowers a
-- rank or rejects a candidate. The approved mapping is global: provider id ->
-- one app player. A different human's conflicting identity evidence (an
-- earlier ignore, another open proposal for the same id or the same app player,
-- a mapping row that holds either identity) blocks approval.
--
-- SIGNALS. Machine structural input: provider, provider player id, requested
-- squad, response completeness. Reviewer signals only: DOB, shirt, position,
-- height, nationality, the provider's registered team. A missing value, an
-- app DOB on 1 January, an implausible or 1 January provider DOB and an
-- incomplete provider squad are NO SIGNAL. A position disagreement is a flag
-- that holds the proposal for a note and an acknowledgement; it never rejects.
-- Names are read by no function here except to show a reviewer.
--
-- STABLE ERRORS: PT401/PT403 (authority), PT404 (missing), PT409 (state), PT400
-- (input). A refusal that must be remembered (a held state) is returned as
-- {"ok": false, "code": ...} after the proposal is moved, never as an error.

-- ===========================================================================
-- Signal helpers
-- ===========================================================================
create function app_private.football_mapping_position_letter(p_position app.football_position)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_position::text
    when 'goalkeeper' then 'G'
    when 'defender' then 'D'
    when 'midfielder' then 'M'
    when 'forward' then 'F'
  end;
$$;

-- The only date-of-birth signal. Both sides must be valid; a 1 January date
-- is a possible placeholder on either side and gives nothing.
create function app_private.football_mapping_dob_signal(
  p_app_dob date,
  p_provider_state text,
  p_provider_dob date,
  p_provider_jan1 boolean,
  p_today date default current_date
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_age integer;
begin
  if p_app_dob is null then
    return jsonb_build_object('signal', 'no_signal', 'reason', 'app_missing');
  end if;
  if p_app_dob > p_today then
    return jsonb_build_object('signal', 'no_signal', 'reason', 'app_future');
  end if;
  v_age := extract(year from age(p_today, p_app_dob));
  if v_age < 15 then
    return jsonb_build_object('signal', 'no_signal', 'reason', 'app_age_below_minimum');
  end if;
  if v_age > 50 then
    return jsonb_build_object('signal', 'no_signal', 'reason', 'app_age_above_maximum');
  end if;
  if extract(month from p_app_dob) = 1 and extract(day from p_app_dob) = 1 then
    return jsonb_build_object('signal', 'no_signal', 'reason', 'app_january_first_low_confidence');
  end if;
  if p_provider_state is distinct from 'valid' or p_provider_dob is null then
    return jsonb_build_object('signal', 'no_signal', 'reason', 'provider_' || coalesce(p_provider_state, 'missing'));
  end if;
  if coalesce(p_provider_jan1, false) then
    return jsonb_build_object('signal', 'no_signal', 'reason', 'provider_january_first_low_confidence');
  end if;
  if p_app_dob = p_provider_dob then
    return jsonb_build_object('signal', 'match', 'reason', null);
  end if;
  return jsonb_build_object('signal', 'conflict', 'reason', null);
end;
$$;

-- The reviewer signals of one candidate against one app player. Reads
-- structure and attributes only; never a name. Missing data is no signal.
create function app_private.football_mapping_candidate_signals(
  p_candidate_id uuid,
  p_app_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_player app.players%rowtype;
  v_count integer;
  v_obs app_private.football_player_mapping_observations%rowtype;
  v_provider_pos text;
  v_app_pos text;
  v_shirt text := 'no_signal';
  v_pos text := 'no_signal';
  v_club text := 'no_signal';
  v_dob jsonb;
  v_flags text[] := '{}';
  v_registered boolean;
  v_incomplete boolean;
  v_app_shirts integer[];
begin
  select * into v_player from app.players where id = p_app_player_id;
  select count(*) into v_count
  from app_private.football_player_mapping_observations where candidate_id = p_candidate_id;

  -- DOB: the latest observation that carries a valid date, else the latest one.
  select * into v_obs
  from app_private.football_player_mapping_observations
  where candidate_id = p_candidate_id
  order by (dob_state = 'valid') desc, observed_at desc, id
  limit 1;
  v_dob := app_private.football_mapping_dob_signal(
    v_player.date_of_birth, v_obs.dob_state, v_obs.provider_birth_date, v_obs.dob_january1);

  -- Shirt: any observed number equal to the app player's shirt is a match.
  select coalesce(array_agg(distinct membership.shirt_number), '{}') into v_app_shirts
  from app.team_memberships membership
  where membership.player_id = p_app_player_id and membership.active and membership.shirt_number is not null;
  if exists (select 1 from app_private.football_player_mapping_observations
      where candidate_id = p_candidate_id and shirt_number = any (v_app_shirts)) then
    v_shirt := 'match';
  elsif cardinality(v_app_shirts) > 0 and exists (
      select 1 from app_private.football_player_mapping_observations
      where candidate_id = p_candidate_id and shirt_number is not null) then
    v_shirt := 'conflict';
  end if;

  -- Position: the provider's most recent known position against the app's.
  select position_signal into v_provider_pos
  from app_private.football_player_mapping_observations
  where candidate_id = p_candidate_id and position_signal is not null
  order by observed_at desc, id limit 1;
  v_app_pos := app_private.football_mapping_position_letter(v_player.position);
  if v_provider_pos is not null and v_app_pos is not null then
    v_pos := case when v_provider_pos = v_app_pos then 'match' else 'conflict' end;
  end if;

  -- Club context: informational only. A mismatch is a flag, never a rejection.
  if exists (select 1 from app_private.football_player_mapping_observations
      where candidate_id = p_candidate_id and app_team_id is not null) then
    if exists (select 1 from app_private.football_player_mapping_observations o
        join app.team_memberships m on m.team_id = o.app_team_id and m.player_id = p_app_player_id and m.active
        where o.candidate_id = p_candidate_id) then
      v_club := 'match';
    elsif exists (select 1 from app.team_memberships where player_id = p_app_player_id and active) then
      v_club := 'mismatch';
    end if;
  end if;

  select coalesce(bool_or(registered_team_disagreement), false),
         coalesce(bool_or(squad_completeness = 'INCOMPLETE_PROVIDER_SQUAD'), false)
  into v_registered, v_incomplete
  from app_private.football_player_mapping_observations where candidate_id = p_candidate_id;

  if v_count > 1 then v_flags := array_append(v_flags, 'MULTI_SQUAD_OBSERVATION'); end if;
  if v_dob ->> 'signal' = 'conflict' then v_flags := array_append(v_flags, 'DOB_CONFLICT'); end if;
  if v_pos = 'conflict' then v_flags := array_append(v_flags, 'POSITION_DISAGREEMENT'); end if;
  if v_shirt = 'conflict' then v_flags := array_append(v_flags, 'SHIRT_DIFFERENCE'); end if;
  if v_registered then v_flags := array_append(v_flags, 'REGISTERED_TEAM_DISAGREEMENT'); end if;
  if v_club = 'mismatch' then v_flags := array_append(v_flags, 'CLUB_CONTEXT_MISMATCH'); end if;
  if v_incomplete then v_flags := array_append(v_flags, 'INCOMPLETE_PROVIDER_SQUAD'); end if;

  return jsonb_build_object(
    'dob', v_dob ->> 'signal',
    'dobReason', v_dob ->> 'reason',
    'shirt', v_shirt,
    'position', v_pos,
    'providerPosition', v_provider_pos,
    'club', v_club,
    'registeredTeamDisagreement', v_registered,
    'observationCount', v_count,
    'flags', to_jsonb(v_flags));
end;
$$;

-- A rank for the reviewer's list. Only agreement adds; a valid conflict costs a
-- little; a missing value costs nothing; nothing is ever dropped from a list.
create function app_private.football_mapping_signal_score(p_signals jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (case p_signals ->> 'dob' when 'match' then 4 when 'conflict' then -2 else 0 end)
    + (case p_signals ->> 'shirt' when 'match' then 1 else 0 end)
    + (case p_signals ->> 'position' when 'match' then 1 when 'conflict' then -1 else 0 end);
$$;

-- ===========================================================================
-- The fingerprint, assembly and re-validation of a proposal
-- ===========================================================================
create function app_private.football_mapping_row_fingerprint(r app_private.football_player_mapping_proposals)
returns text
language sql
immutable
set search_path = ''
as $$
  -- No name is in here, by construction.
  select app_private.admin_payload_fingerprint(jsonb_build_object(
    'kind', r.kind,
    'sofascoreCandidateId', r.sofascore_candidate_id,
    'flashscoreCandidateId', r.flashscore_candidate_id,
    'sofascoreExternalId', r.sofascore_external_id,
    'flashscoreExternalId', r.flashscore_external_id,
    'providerName', r.provider_name,
    'mappingId', r.mapping_id,
    'appPlayerId', r.app_player_id,
    'newExternalId', r.new_external_id,
    'newAppPlayerId', r.new_app_player_id,
    'expectedBefore', r.expected_before,
    'basis', r.basis,
    'evidence', r.evidence,
    'signals', r.signals,
    'candidateRevisions', r.candidate_revisions,
    'positionDisagreement', r.position_disagreement,
    'positionNote', r.position_note,
    'reason', r.reason));
$$;

create function app_private.football_mapping_refuse(p_code text)
returns jsonb
language sql
immutable
set search_path = ''
as $$ select jsonb_build_object('ok', false, 'code', p_code); $$;

-- What the world says today about a proposed decision. Returns either
-- {"ok": false, "code": ...} or {"ok": true, ...the evidence...}. Used to
-- build a proposal and again, unchanged, to re-check it at approval and at
-- execution, so a proposal can never rest on evidence that has moved.
create function app_private.football_mapping_compute(
  p_kind text,
  p_sofascore_candidate uuid,
  p_flashscore_candidate uuid,
  p_provider text,
  p_mapping_id uuid,
  p_app_player_id uuid,
  p_new_external_id text,
  p_new_app_player_id uuid,
  p_exclude_proposal uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c_open constant text[] := array['pending', 'approved', 'position_disagreement', 'stale_evidence'];
  v_cid uuid;
  v_candidate app_private.football_player_mapping_candidates%rowtype;
  v_row app_private.football_provider_mappings%rowtype;
  v_expected jsonb;
  v_signals jsonb := '{}'::jsonb;
  v_evidence_candidates jsonb := '[]'::jsonb;
  v_revisions jsonb := '{}'::jsonb;
  v_sofa_ext text;
  v_flash_ext text;
  v_sofa_pos text;
  v_flash_pos text;
  v_app_pos text;
  v_pos_dis boolean := false;
  v_target_player uuid;
  v_target_provider text;
  v_target_candidate uuid;
  v_player_ok boolean;
  v_rev integer;
begin
  if p_kind = 'map' then
    if p_app_player_id is null or (p_sofascore_candidate is null and p_flashscore_candidate is null) then
      return app_private.football_mapping_refuse('invalid_proposal');
    end if;
    if not exists (select 1 from app.players where id = p_app_player_id and active) then
      return app_private.football_mapping_refuse('app_player_not_found');
    end if;
    foreach v_cid in array array[p_sofascore_candidate, p_flashscore_candidate] loop
      continue when v_cid is null;
      select * into v_candidate from app_private.football_player_mapping_candidates where id = v_cid;
      if not found then return app_private.football_mapping_refuse('candidate_not_found'); end if;
      if (v_cid = p_sofascore_candidate and v_candidate.provider_name <> 'sofascore')
        or (v_cid = p_flashscore_candidate and v_candidate.provider_name <> 'flashscore') then
        return app_private.football_mapping_refuse('candidate_provider_mismatch');
      end if;
      if v_candidate.status = 'ignored' then
        return app_private.football_mapping_refuse('identity_conflict');
      end if;
      if v_candidate.status = 'mapped' or v_candidate.existing_mapping_id is not null
        or exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_candidate.provider_name and m.entity_type = 'player'
            and m.external_id = v_candidate.external_id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_candidate.provider_name and m.entity_type = 'player'
            and m.internal_entity_id = p_app_player_id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if exists (select 1 from app_private.football_player_mapping_proposals p
          where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
            and (p.sofascore_candidate_id = v_cid or p.flashscore_candidate_id = v_cid)) then
        return app_private.football_mapping_refuse('proposal_already_open');
      end if;
      if v_candidate.provider_name = 'sofascore' then v_sofa_ext := v_candidate.external_id;
      else v_flash_ext := v_candidate.external_id; end if;
      v_signals := v_signals || jsonb_build_object(
        v_candidate.provider_name, app_private.football_mapping_candidate_signals(v_cid, p_app_player_id));
      v_revisions := v_revisions || jsonb_build_object(v_candidate.provider_name, v_candidate.evidence_revision);
      v_evidence_candidates := v_evidence_candidates || jsonb_build_array(jsonb_build_object(
        'provider', v_candidate.provider_name,
        'candidateId', v_cid,
        'externalId', v_candidate.external_id,
        'observationCount', (v_signals -> v_candidate.provider_name ->> 'observationCount')::integer));
    end loop;
    if exists (select 1 from app_private.football_player_mapping_proposals p
        where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
          and coalesce(p.app_player_id, p.new_app_player_id) = p_app_player_id) then
      return app_private.football_mapping_refuse('identity_conflict');
    end if;
    v_app_pos := app_private.football_mapping_position_letter(
      (select position from app.players where id = p_app_player_id));
    v_sofa_pos := v_signals -> 'sofascore' ->> 'providerPosition';
    v_flash_pos := v_signals -> 'flashscore' ->> 'providerPosition';
    v_pos_dis := (v_sofa_pos is not null and v_flash_pos is not null and v_sofa_pos <> v_flash_pos)
      or (v_sofa_pos is not null and v_app_pos is not null and v_sofa_pos <> v_app_pos)
      or (v_flash_pos is not null and v_app_pos is not null and v_flash_pos <> v_app_pos);
    return jsonb_build_object('ok', true,
      'sofascoreExternalId', v_sofa_ext, 'flashscoreExternalId', v_flash_ext,
      'providerName', null, 'expectedBefore', null,
      'evidence', jsonb_build_object('candidates', v_evidence_candidates, 'appPlayerId', p_app_player_id),
      'signals', v_signals, 'candidateRevisions', v_revisions, 'positionDisagreement', v_pos_dis);

  elsif p_kind in ('replace', 'deactivate', 'reactivate') then
    if p_mapping_id is null then return app_private.football_mapping_refuse('invalid_proposal'); end if;
    select * into v_row from app_private.football_provider_mappings
    where id = p_mapping_id and entity_type = 'player' and provider_name in ('sofascore', 'flashscore');
    if not found then return app_private.football_mapping_refuse('mapping_not_found'); end if;
    if p_provider is distinct from v_row.provider_name then
      return app_private.football_mapping_refuse('mapping_provider_mismatch');
    end if;
    v_expected := jsonb_build_object('mappingId', v_row.id, 'provider', v_row.provider_name,
      'externalId', v_row.external_id, 'appPlayerId', v_row.internal_entity_id, 'active', v_row.active);
    if exists (select 1 from app_private.football_player_mapping_proposals p
        where p.status = any (c_open) and p.id is distinct from p_exclude_proposal and p.mapping_id = v_row.id) then
      return app_private.football_mapping_refuse('proposal_already_open');
    end if;
    if p_kind in ('replace', 'deactivate') and not v_row.active then
      return app_private.football_mapping_refuse('mapping_not_active');
    end if;
    if p_kind = 'reactivate' and v_row.active then
      return app_private.football_mapping_refuse('mapping_already_active');
    end if;
    if p_kind = 'deactivate' and (p_new_external_id is not null or p_new_app_player_id is not null) then
      return app_private.football_mapping_refuse('invalid_proposal');
    end if;
    if p_kind = 'replace' and p_new_external_id is null and p_new_app_player_id is null then
      return app_private.football_mapping_refuse('invalid_proposal');
    end if;
    if (p_new_external_id is not null and p_new_external_id = v_row.external_id)
      or (p_new_app_player_id is not null and p_new_app_player_id = v_row.internal_entity_id) then
      return app_private.football_mapping_refuse('no_change');
    end if;
    if p_new_external_id is not null then
      if exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_row.provider_name and m.entity_type = 'player'
            and m.external_id = p_new_external_id and m.id <> v_row.id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if exists (select 1 from app_private.football_player_mapping_proposals p
          where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
            and ((p.provider_name = v_row.provider_name and p.new_external_id = p_new_external_id)
              or (v_row.provider_name = 'sofascore' and p.sofascore_external_id = p_new_external_id)
              or (v_row.provider_name = 'flashscore' and p.flashscore_external_id = p_new_external_id))) then
        return app_private.football_mapping_refuse('identity_conflict');
      end if;
    end if;
    if p_new_app_player_id is not null then
      select exists (select 1 from app.players where id = p_new_app_player_id and active) into v_player_ok;
      if not v_player_ok then return app_private.football_mapping_refuse('app_player_not_found'); end if;
      if exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_row.provider_name and m.entity_type = 'player'
            and m.internal_entity_id = p_new_app_player_id and m.id <> v_row.id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if exists (select 1 from app_private.football_player_mapping_proposals p
          where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
            and coalesce(p.app_player_id, p.new_app_player_id) = p_new_app_player_id) then
        return app_private.football_mapping_refuse('identity_conflict');
      end if;
    end if;
    -- Signals for the pairing the row will hold afterwards, where a candidate exists.
    v_target_player := coalesce(p_new_app_player_id, v_row.internal_entity_id);
    select id, evidence_revision into v_target_candidate, v_rev
    from app_private.football_player_mapping_candidates
    where provider_name = v_row.provider_name
      and external_id = coalesce(p_new_external_id, v_row.external_id);
    if v_target_candidate is not null and p_kind <> 'deactivate' then
      v_signals := jsonb_build_object(v_row.provider_name,
        app_private.football_mapping_candidate_signals(v_target_candidate, v_target_player));
      v_revisions := jsonb_build_object(v_row.provider_name, v_rev);
      v_app_pos := app_private.football_mapping_position_letter(
        (select position from app.players where id = v_target_player));
      v_sofa_pos := v_signals -> v_row.provider_name ->> 'providerPosition';
      v_pos_dis := v_sofa_pos is not null and v_app_pos is not null and v_sofa_pos <> v_app_pos;
    end if;
    return jsonb_build_object('ok', true,
      'sofascoreExternalId', null, 'flashscoreExternalId', null,
      'providerName', v_row.provider_name, 'expectedBefore', v_expected,
      'evidence', jsonb_build_object('mappingId', v_row.id, 'before', v_expected,
        'newExternalId', p_new_external_id, 'newAppPlayerId', p_new_app_player_id),
      'signals', v_signals, 'candidateRevisions', v_revisions, 'positionDisagreement', v_pos_dis);

  elsif p_kind in ('ignore', 'reverse_ignore') then
    if (p_sofascore_candidate is null) = (p_flashscore_candidate is null) then
      return app_private.football_mapping_refuse('invalid_proposal');
    end if;
    v_cid := coalesce(p_sofascore_candidate, p_flashscore_candidate);
    select * into v_candidate from app_private.football_player_mapping_candidates where id = v_cid;
    if not found then return app_private.football_mapping_refuse('candidate_not_found'); end if;
    if (p_sofascore_candidate is not null and v_candidate.provider_name <> 'sofascore')
      or (p_flashscore_candidate is not null and v_candidate.provider_name <> 'flashscore') then
      return app_private.football_mapping_refuse('candidate_provider_mismatch');
    end if;
    if exists (select 1 from app_private.football_player_mapping_proposals p
        where p.status = any (c_open) and p.id is distinct from p_exclude_proposal
          and (p.sofascore_candidate_id = v_cid or p.flashscore_candidate_id = v_cid)) then
      return app_private.football_mapping_refuse('proposal_already_open');
    end if;
    if p_kind = 'ignore' then
      if v_candidate.status = 'ignored' then return app_private.football_mapping_refuse('already_ignored'); end if;
      if v_candidate.status = 'mapped' or v_candidate.existing_mapping_id is not null
        or exists (select 1 from app_private.football_provider_mappings m
          where m.provider_name = v_candidate.provider_name and m.entity_type = 'player'
            and m.external_id = v_candidate.external_id) then
        return app_private.football_mapping_refuse('already_mapped');
      end if;
      if v_candidate.lineup_or_incident_seen then
        return app_private.football_mapping_refuse('ignore_refused_id_in_lineup');
      end if;
    elsif v_candidate.status <> 'ignored' then
      return app_private.football_mapping_refuse('not_ignored');
    end if;
    return jsonb_build_object('ok', true,
      'sofascoreExternalId', case when p_sofascore_candidate is not null then v_candidate.external_id end,
      'flashscoreExternalId', case when p_flashscore_candidate is not null then v_candidate.external_id end,
      'providerName', v_candidate.provider_name, 'expectedBefore', null,
      'evidence', jsonb_build_object('candidates', jsonb_build_array(jsonb_build_object(
        'provider', v_candidate.provider_name, 'candidateId', v_cid, 'externalId', v_candidate.external_id,
        'lineupOrIncidentSeen', v_candidate.lineup_or_incident_seen))),
      'signals', '{}'::jsonb,
      'candidateRevisions', jsonb_build_object(v_candidate.provider_name, v_candidate.evidence_revision),
      'positionDisagreement', false);
  end if;
  return app_private.football_mapping_refuse('invalid_proposal');
end;
$$;

-- A proposal moved into a held state by what changed since it was made.
create function app_private.football_mapping_hold_status(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_code
    when 'already_mapped' then 'already_mapped'
    when 'identity_conflict' then 'identity_conflict'
    when 'proposal_already_open' then 'identity_conflict'
    when 'ignore_refused_id_in_lineup' then 'identity_conflict'
    when 'already_ignored' then 'identity_conflict'
    else 'stale_evidence'
  end;
$$;

-- Null when the proposal still rests on today's world; else the code to hold it.
create function app_private.football_mapping_revalidate(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p app_private.football_player_mapping_proposals%rowtype;
  v jsonb;
begin
  select * into p from app_private.football_player_mapping_proposals where id = p_id;
  v := app_private.football_mapping_compute(p.kind, p.sofascore_candidate_id, p.flashscore_candidate_id,
    p.provider_name, p.mapping_id, p.app_player_id, p.new_external_id, p.new_app_player_id, p.id);
  if not (v ->> 'ok')::boolean then
    return v ->> 'code';
  end if;
  if nullif(v -> 'expectedBefore', 'null'::jsonb) is distinct from p.expected_before then
    return 'mapping_row_changed';
  end if;
  if v -> 'candidateRevisions' is distinct from p.candidate_revisions
    or v -> 'evidence' is distinct from (p.evidence - 'refs')
    or v -> 'signals' is distinct from p.signals
    or (v ->> 'positionDisagreement')::boolean is distinct from p.position_disagreement then
    return 'stale_evidence';
  end if;
  return null;
end;
$$;

-- ===========================================================================
-- Candidate bookkeeping
-- ===========================================================================
-- Bring a candidate's status in line with what the mapping table says now.
create function app_private.football_mapping_resync_candidate(p_provider text, p_external_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_open constant text[] := array['pending', 'approved', 'position_disagreement', 'stale_evidence'];
  v_candidate app_private.football_player_mapping_candidates%rowtype;
  v_row app_private.football_provider_mappings%rowtype;
  v_status text;
begin
  select * into v_candidate from app_private.football_player_mapping_candidates
  where provider_name = p_provider and external_id = p_external_id for update;
  if not found then return; end if;
  select * into v_row from app_private.football_provider_mappings
  where provider_name = p_provider and entity_type = 'player' and external_id = p_external_id;
  if found then
    v_status := case when v_row.active then 'mapped' else 'unmapped' end;
    update app_private.football_player_mapping_candidates
    set status = v_status, existing_mapping_id = v_row.id
    where id = v_candidate.id;
  else
    v_status := case
      when v_candidate.status = 'ignored' then 'ignored'
      when exists (select 1 from app_private.football_player_mapping_proposals p
        where p.status = any (c_open)
          and (p.sofascore_candidate_id = v_candidate.id or p.flashscore_candidate_id = v_candidate.id)
          and p.kind in ('map', 'ignore')) then 'proposed'
      else 'unmapped' end;
    update app_private.football_player_mapping_candidates
    set status = v_status, existing_mapping_id = null
    where id = v_candidate.id;
  end if;
end;
$$;

-- A proposal that ended without being executed gives its candidates back.
create function app_private.football_mapping_release_candidates(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p app_private.football_player_mapping_proposals%rowtype;
  v_candidate app_private.football_player_mapping_candidates%rowtype;
  v_cid uuid;
begin
  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id;
  foreach v_cid in array array[p.sofascore_candidate_id, p.flashscore_candidate_id] loop
    continue when v_cid is null;
    select * into v_candidate from app_private.football_player_mapping_candidates where id = v_cid;
    perform app_private.football_mapping_resync_candidate(v_candidate.provider_name, v_candidate.external_id);
  end loop;
end;
$$;

create function app_private.football_mapping_audit(
  p_actor uuid,
  p_action text,
  p_proposal app_private.football_player_mapping_proposals,
  p_reason text,
  p_request_id uuid,
  p_before jsonb default null,
  p_after jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.write_admin_audit(
    p_actor, p_action, 'football', p_proposal.id,
    coalesce(nullif(btrim(p_reason), ''), p_proposal.reason),
    coalesce(p_request_id, gen_random_uuid()), p_proposal.correlation_id, null,
    p_before,
    coalesce(p_after, '{}'::jsonb) || jsonb_build_object(
      'proposalId', p_proposal.id, 'kind', p_proposal.kind, 'status', p_proposal.status,
      'fingerprint', p_proposal.fingerprint, 'batchId', p_proposal.batch_id));
end;
$$;

-- ===========================================================================
-- Propose
-- ===========================================================================
create function api.admin_football_mapping_propose(
  p_items jsonb,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_prev jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_batch uuid := gen_random_uuid();
  v_item jsonb;
  v_index integer := 0;
  v_kind text;
  v_computed jsonb;
  v_row app_private.football_player_mapping_proposals%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_sofa uuid;
  v_flash uuid;
  v_basis text;
  v_status text;
  v_refs jsonb;
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode = 'PT400', message = 'invalid_proposal';
  end if;
  if char_length(v_reason) not between 10 and 500 then
    raise exception using errcode = 'PT400', message = 'reason_required';
  end if;
  v_prev := app_private.admin_begin_idempotent_operation(
    v_actor, 'football.mapping_propose', p_idempotency_key,
    jsonb_build_object('items', p_items, 'reason', v_reason));
  if v_prev is not null then return v_prev; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_index := v_index + 1;
    v_kind := v_item ->> 'kind';
    v_sofa := nullif(v_item ->> 'sofascoreCandidateId', '')::uuid;
    v_flash := nullif(v_item ->> 'flashscoreCandidateId', '')::uuid;
    v_basis := coalesce(v_item ->> 'basis', 'manual');
    v_refs := coalesce(v_item -> 'evidenceRefs', '[]'::jsonb);
    if v_kind is null or v_kind not in ('map', 'replace', 'deactivate', 'reactivate', 'ignore', 'reverse_ignore')
      or v_basis not in ('incident', 'shirt_position', 'manual')
      or jsonb_typeof(v_refs) <> 'array' or jsonb_array_length(v_refs) > 20
      or app_private.football_mapping_json_has_name_key(v_refs) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_index, 'ok', false, 'code', 'invalid_proposal'));
      continue;
    end if;
    v_computed := app_private.football_mapping_compute(
      v_kind, v_sofa, v_flash,
      v_item ->> 'providerName',
      nullif(v_item ->> 'mappingId', '')::uuid,
      nullif(v_item ->> 'appPlayerId', '')::uuid,
      nullif(v_item ->> 'newExternalId', ''),
      nullif(v_item ->> 'newAppPlayerId', '')::uuid);
    if not (v_computed ->> 'ok')::boolean then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_index, 'ok', false, 'code', v_computed ->> 'code'));
      continue;
    end if;

    v_row := null;
    v_row.id := gen_random_uuid();
    v_row.batch_id := v_batch;
    v_row.kind := v_kind;
    v_row.sofascore_candidate_id := v_sofa;
    v_row.flashscore_candidate_id := v_flash;
    v_row.sofascore_external_id := v_computed ->> 'sofascoreExternalId';
    v_row.flashscore_external_id := v_computed ->> 'flashscoreExternalId';
    v_row.provider_name := v_computed ->> 'providerName';
    v_row.mapping_id := nullif(v_item ->> 'mappingId', '')::uuid;
    v_row.app_player_id := nullif(v_item ->> 'appPlayerId', '')::uuid;
    v_row.new_external_id := nullif(v_item ->> 'newExternalId', '');
    v_row.new_app_player_id := nullif(v_item ->> 'newAppPlayerId', '')::uuid;
    v_row.expected_before := nullif(v_computed -> 'expectedBefore', 'null'::jsonb);
    v_row.basis := v_basis;
    v_row.evidence := (v_computed -> 'evidence') || jsonb_build_object('refs', v_refs);
    v_row.signals := v_computed -> 'signals';
    v_row.candidate_revisions := v_computed -> 'candidateRevisions';
    v_row.position_disagreement := (v_computed ->> 'positionDisagreement')::boolean;
    v_row.reason := v_reason;
    v_row.requested_by := v_actor;
    v_row.requested_at := statement_timestamp();
    v_row.expires_at := statement_timestamp() + interval '72 hours';
    v_row.correlation_id := gen_random_uuid();
    v_status := case when v_row.position_disagreement then 'position_disagreement' else 'pending' end;
    v_row.status := v_status;
    v_row.fingerprint := app_private.football_mapping_row_fingerprint(v_row);

    begin
      insert into app_private.football_player_mapping_proposals (
        id, batch_id, kind, status, sofascore_candidate_id, flashscore_candidate_id,
        sofascore_external_id, flashscore_external_id, provider_name, mapping_id,
        app_player_id, new_external_id, new_app_player_id, expected_before, basis,
        evidence, signals, candidate_revisions, position_disagreement, reason,
        requested_by, requested_at, expires_at, fingerprint, correlation_id)
      values (
        v_row.id, v_row.batch_id, v_row.kind, v_row.status, v_row.sofascore_candidate_id,
        v_row.flashscore_candidate_id, v_row.sofascore_external_id, v_row.flashscore_external_id,
        v_row.provider_name, v_row.mapping_id, v_row.app_player_id, v_row.new_external_id,
        v_row.new_app_player_id, v_row.expected_before, v_row.basis, v_row.evidence, v_row.signals,
        v_row.candidate_revisions, v_row.position_disagreement, v_row.reason,
        v_row.requested_by, v_row.requested_at, v_row.expires_at, v_row.fingerprint, v_row.correlation_id);
    exception when unique_violation then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_index, 'ok', false, 'code', 'proposal_already_open'));
      continue;
    end;

    if v_kind in ('map', 'ignore') then
      update app_private.football_player_mapping_candidates
      set status = 'proposed'
      where id in (v_sofa, v_flash) and status = 'unmapped';
    end if;
    select * into v_row from app_private.football_player_mapping_proposals where id = v_row.id;
    perform app_private.football_mapping_audit(v_actor, 'football.mapping_proposed', v_row,
      v_reason, p_idempotency_key);
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'index', v_index, 'ok', true, 'id', v_row.id, 'kind', v_row.kind, 'status', v_row.status,
      'fingerprint', v_row.fingerprint, 'positionDisagreement', v_row.position_disagreement));
  end loop;

  return app_private.admin_complete_idempotent_operation(
    v_actor, 'football.mapping_propose', p_idempotency_key,
    jsonb_build_object('batchId', v_batch, 'proposals', v_results));
end;
$$;

-- ===========================================================================
-- The proposer's two ways out of a held state, and withdrawing
-- ===========================================================================
create function api.admin_football_mapping_add_position_note(
  p_proposal_id uuid,
  p_note text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_prev jsonb;
  p app_private.football_player_mapping_proposals%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  v_prev := app_private.admin_begin_idempotent_operation(v_actor, 'football.mapping_note',
    p_idempotency_key, jsonb_build_object('id', p_proposal_id, 'note', v_note));
  if v_prev is not null then return v_prev; end if;
  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'proposal_not_found'; end if;
  if p.requested_by <> v_actor then
    raise exception using errcode = 'PT403', message = 'not_authorized';
  end if;
  if char_length(v_note) not between 10 and 500 then
    raise exception using errcode = 'PT400', message = 'note_required';
  end if;
  if p.status <> 'position_disagreement' then
    raise exception using errcode = 'PT409', message = 'proposal_not_awaiting_note';
  end if;
  perform set_config('app.football_mapping_note', 'on', true);
  perform set_config('app.football_mapping_refresh', 'on', true);
  p.position_note := v_note;
  p.fingerprint := app_private.football_mapping_row_fingerprint(p);
  update app_private.football_player_mapping_proposals
  set position_note = v_note, fingerprint = p.fingerprint, status = 'pending'
  where id = p.id;
  perform set_config('app.football_mapping_note', 'off', true);
  perform set_config('app.football_mapping_refresh', 'off', true);
  select * into p from app_private.football_player_mapping_proposals where id = p.id;
  perform app_private.football_mapping_audit(v_actor, 'football.mapping_note_added', p, v_note, p_idempotency_key);
  return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_note',
    p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status,
      'fingerprint', p.fingerprint));
end;
$$;

create function api.admin_football_mapping_refresh_evidence(
  p_proposal_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_prev jsonb;
  p app_private.football_player_mapping_proposals%rowtype;
  v_computed jsonb;
  v_hold text;
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  v_prev := app_private.admin_begin_idempotent_operation(v_actor, 'football.mapping_refresh',
    p_idempotency_key, jsonb_build_object('id', p_proposal_id));
  if v_prev is not null then return v_prev; end if;
  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'proposal_not_found'; end if;
  if p.requested_by <> v_actor then
    raise exception using errcode = 'PT403', message = 'not_authorized';
  end if;
  if p.status <> 'stale_evidence' then
    raise exception using errcode = 'PT409', message = 'proposal_not_stale';
  end if;
  v_computed := app_private.football_mapping_compute(p.kind, p.sofascore_candidate_id,
    p.flashscore_candidate_id, p.provider_name, p.mapping_id, p.app_player_id,
    p.new_external_id, p.new_app_player_id, p.id);
  if not (v_computed ->> 'ok')::boolean then
    v_hold := app_private.football_mapping_hold_status(v_computed ->> 'code');
    if v_hold = 'stale_evidence' then
      -- Nothing to refresh to: the world does not allow this decision at all.
      raise exception using errcode = 'PT409', message = v_computed ->> 'code';
    end if;
    update app_private.football_player_mapping_proposals
    set status = v_hold, hold_code = v_computed ->> 'code' where id = p.id;
    perform app_private.football_mapping_release_candidates(p.id);
    select * into p from app_private.football_player_mapping_proposals where id = p.id;
    perform app_private.football_mapping_audit(v_actor, 'football.mapping_held', p,
      'Refresh found the decision no longer possible: ' || (v_computed ->> 'code'), p_idempotency_key);
    return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_refresh',
      p_idempotency_key, jsonb_build_object('ok', false, 'code', v_computed ->> 'code', 'status', p.status));
  end if;

  perform set_config('app.football_mapping_refresh', 'on', true);
  p.expected_before := nullif(v_computed -> 'expectedBefore', 'null'::jsonb);
  p.evidence := (v_computed -> 'evidence') || jsonb_build_object('refs', coalesce(p.evidence -> 'refs', '[]'::jsonb));
  p.signals := v_computed -> 'signals';
  p.candidate_revisions := v_computed -> 'candidateRevisions';
  p.position_disagreement := (v_computed ->> 'positionDisagreement')::boolean;
  p.fingerprint := app_private.football_mapping_row_fingerprint(p);
  -- An earlier approval never carries over: the decision is cleared with the old fingerprint.
  update app_private.football_player_mapping_proposals
  set expected_before = p.expected_before, evidence = p.evidence, signals = p.signals,
      candidate_revisions = p.candidate_revisions, position_disagreement = p.position_disagreement,
      fingerprint = p.fingerprint,
      expires_at = statement_timestamp() + interval '72 hours',
      decided_by = null, decided_at = null, decision_reason = null,
      position_disagreement_acknowledged = false, hold_code = null,
      status = case when p.position_disagreement and p.position_note is null
        then 'position_disagreement' else 'pending' end
  where id = p.id;
  perform set_config('app.football_mapping_refresh', 'off', true);
  select * into p from app_private.football_player_mapping_proposals where id = p.id;
  perform app_private.football_mapping_audit(v_actor, 'football.mapping_refreshed', p,
    'Evidence refreshed; any earlier approval no longer applies.', p_idempotency_key);
  return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_refresh',
    p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status,
      'fingerprint', p.fingerprint));
end;
$$;

create function api.admin_football_mapping_cancel(
  p_proposal_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_prev jsonb;
  p app_private.football_player_mapping_proposals%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  if char_length(v_reason) not between 10 and 500 then
    raise exception using errcode = 'PT400', message = 'reason_required';
  end if;
  v_prev := app_private.admin_begin_idempotent_operation(v_actor, 'football.mapping_cancel',
    p_idempotency_key, jsonb_build_object('id', p_proposal_id, 'reason', v_reason));
  if v_prev is not null then return v_prev; end if;
  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'proposal_not_found'; end if;
  if p.requested_by <> v_actor then
    raise exception using errcode = 'PT403', message = 'not_authorized';
  end if;
  if p.status not in ('pending', 'position_disagreement', 'stale_evidence', 'approved') then
    raise exception using errcode = 'PT409', message = 'proposal_not_open';
  end if;
  -- The cancel reason lives in the audit event; the decision columns stay as they were.
  update app_private.football_player_mapping_proposals set status = 'cancelled' where id = p.id;
  perform app_private.football_mapping_release_candidates(p.id);
  select * into p from app_private.football_player_mapping_proposals where id = p.id;
  perform app_private.football_mapping_audit(v_actor, 'football.mapping_cancelled', p, v_reason, p_idempotency_key);
  return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_cancel',
    p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status));
end;
$$;

-- ===========================================================================
-- Decide: a DIFFERENT human approves or rejects the exact fingerprint
-- ===========================================================================
create function api.admin_football_mapping_decide(
  p_proposal_id uuid,
  p_decision text,
  p_decision_reason text,
  p_fingerprint text,
  p_position_acknowledged boolean,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_prev jsonb;
  p app_private.football_player_mapping_proposals%rowtype;
  v_reason text := btrim(coalesce(p_decision_reason, ''));
  v_hold text;
  v_new_status text;
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = 'PT400', message = 'invalid_decision';
  end if;
  if char_length(v_reason) not between 10 and 500 then
    raise exception using errcode = 'PT400', message = 'reason_required';
  end if;
  v_prev := app_private.admin_begin_idempotent_operation(v_actor, 'football.mapping_decide',
    p_idempotency_key, jsonb_build_object('id', p_proposal_id, 'decision', p_decision,
      'reason', v_reason, 'fingerprint', p_fingerprint,
      'ack', coalesce(p_position_acknowledged, false)));
  if v_prev is not null then return v_prev; end if;

  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'proposal_not_found'; end if;
  if p.requested_by = v_actor then
    raise exception using errcode = 'PT403', message = 'self_approval_denied';
  end if;
  case p.status
    when 'pending' then null;
    when 'position_disagreement' then
      raise exception using errcode = 'PT409', message = 'position_disagreement_unacknowledged';
    when 'stale_evidence' then
      raise exception using errcode = 'PT409', message = 'stale_evidence';
    when 'identity_conflict' then
      raise exception using errcode = 'PT409', message = 'identity_conflict';
    when 'already_mapped' then
      raise exception using errcode = 'PT409', message = 'already_mapped';
    else
      raise exception using errcode = 'PT409', message = 'proposal_not_pending';
  end case;
  if statement_timestamp() > p.expires_at then
    raise exception using errcode = 'PT409', message = 'proposal_expired';
  end if;
  if p_fingerprint is distinct from p.fingerprint
    or app_private.football_mapping_row_fingerprint(p) is distinct from p.fingerprint then
    raise exception using errcode = 'PT409', message = 'fingerprint_mismatch';
  end if;

  if p_decision = 'reject' then
    update app_private.football_player_mapping_proposals
    set status = 'rejected', decided_by = v_actor, decided_at = statement_timestamp(),
        decision_reason = v_reason
    where id = p.id;
    perform app_private.football_mapping_release_candidates(p.id);
    select * into p from app_private.football_player_mapping_proposals where id = p.id;
    perform app_private.football_mapping_audit(v_actor, 'football.mapping_rejected', p, v_reason, p_idempotency_key);
    return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_decide',
      p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status));
  end if;

  -- Approve: the world must still be the one the proposer saw.
  v_hold := app_private.football_mapping_revalidate(p.id);
  if v_hold is not null then
    v_new_status := app_private.football_mapping_hold_status(v_hold);
    update app_private.football_player_mapping_proposals
    set status = v_new_status, hold_code = v_hold where id = p.id;
    perform app_private.football_mapping_release_candidates(p.id);
    select * into p from app_private.football_player_mapping_proposals where id = p.id;
    perform app_private.football_mapping_audit(v_actor, 'football.mapping_held', p,
      'Approval refused, the evidence changed: ' || v_hold, p_idempotency_key);
    return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_decide',
      p_idempotency_key, jsonb_build_object('ok', false, 'code', v_hold, 'status', p.status));
  end if;

  if p.position_disagreement and (p.position_note is null or not coalesce(p_position_acknowledged, false)) then
    raise exception using errcode = 'PT409', message = 'position_disagreement_unacknowledged';
  end if;

  update app_private.football_player_mapping_proposals
  set status = 'approved', decided_by = v_actor, decided_at = statement_timestamp(),
      decision_reason = v_reason,
      position_disagreement_acknowledged = coalesce(p_position_acknowledged, false)
  where id = p.id;
  select * into p from app_private.football_player_mapping_proposals where id = p.id;
  perform app_private.football_mapping_audit(v_actor, 'football.mapping_approved', p, v_reason, p_idempotency_key);
  return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_decide',
    p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status,
      'fingerprint', p.fingerprint));
end;
$$;

-- ===========================================================================
-- Execute: exactly once, one guarded transaction
-- ===========================================================================
create function api.admin_football_mapping_execute(
  p_proposal_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_prev jsonb;
  p app_private.football_player_mapping_proposals%rowtype;
  v_approver_user uuid;
  v_hold text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_row app_private.football_provider_mappings%rowtype;
  v_cid uuid;
  v_candidate app_private.football_player_mapping_candidates%rowtype;
  v_rows jsonb := '[]'::jsonb;
  v_refusal text;
  v_old_ext text;
  v_source text;
begin
  v_actor := app_private.admin_assert_permission('football.manage_mappings');
  v_prev := app_private.admin_begin_idempotent_operation(v_actor, 'football.mapping_execute',
    p_idempotency_key, jsonb_build_object('id', p_proposal_id));
  if v_prev is not null then return v_prev; end if;

  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'proposal_not_found'; end if;
  if p.status = 'executed' then
    raise exception using errcode = 'PT409', message = 'operation_already_executed';
  end if;
  if p.status <> 'approved' then
    raise exception using errcode = 'PT409', message = 'proposal_not_approved';
  end if;
  if p.decided_at < statement_timestamp() - interval '24 hours' then
    raise exception using errcode = 'PT409', message = 'approval_expired';
  end if;
  if p.decided_by is null or p.decided_by = p.requested_by
    or app_private.football_mapping_row_fingerprint(p) is distinct from p.fingerprint then
    raise exception using errcode = 'PT409', message = 'fingerprint_mismatch';
  end if;
  -- The approver must still be who they were: active, and still allowed to approve.
  select sp.auth_user_id into v_approver_user
  from app_private.staff_principals sp
  where sp.id = p.decided_by and sp.status = 'active';
  if v_approver_user is null
    or not app_private.admin_has_permission(p.decided_by, 'football.manage_mappings') then
    raise exception using errcode = 'PT409', message = 'approver_no_longer_qualified';
  end if;

  -- Re-check the world once more, then write; any refusal rolls the block back.
  begin
    v_hold := app_private.football_mapping_revalidate(p.id);
    if v_hold is not null then
      raise exception using errcode = 'PT409', message = v_hold;
    end if;
    v_source := 'football_player_mapping:' || p.id::text;

    if p.kind = 'map' then
      foreach v_cid in array array[p.sofascore_candidate_id, p.flashscore_candidate_id] loop
        continue when v_cid is null;
        select * into v_candidate from app_private.football_player_mapping_candidates
        where id = v_cid for update;
        if exists (select 1 from app_private.football_provider_mappings m
            where m.provider_name = v_candidate.provider_name and m.entity_type = 'player'
              and (m.external_id = v_candidate.external_id or m.internal_entity_id = p.app_player_id)) then
          raise exception using errcode = 'PT409', message = 'already_mapped';
        end if;
        insert into app_private.football_provider_mappings (
          provider_name, entity_type, external_id, internal_entity_id, source_version,
          last_seen_at, active, manually_corrected, correction_reason, corrected_by, corrected_at)
        values (v_candidate.provider_name, 'player', v_candidate.external_id, p.app_player_id,
          v_source, statement_timestamp(), true, true, p.reason, v_approver_user, statement_timestamp())
        returning * into v_row;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
          'mappingId', v_row.id, 'provider', v_row.provider_name, 'externalId', v_row.external_id,
          'appPlayerId', v_row.internal_entity_id, 'active', v_row.active));
        perform app_private.football_mapping_resync_candidate(v_candidate.provider_name, v_candidate.external_id);
      end loop;
      v_before := jsonb_build_object('rows', '[]'::jsonb);
      v_after := jsonb_build_object('rows', v_rows);

    elsif p.kind in ('replace', 'deactivate', 'reactivate') then
      select * into v_row from app_private.football_provider_mappings
      where id = p.mapping_id and entity_type = 'player' for update;
      if not found then raise exception using errcode = 'PT409', message = 'mapping_row_changed'; end if;
      -- Compare and swap.
      if jsonb_build_object('mappingId', v_row.id, 'provider', v_row.provider_name,
          'externalId', v_row.external_id, 'appPlayerId', v_row.internal_entity_id, 'active', v_row.active)
        is distinct from p.expected_before then
        raise exception using errcode = 'PT409', message = 'mapping_row_changed';
      end if;
      v_old_ext := v_row.external_id;
      v_before := jsonb_build_object('mappingId', v_row.id, 'provider', v_row.provider_name,
        'externalId', v_row.external_id, 'appPlayerId', v_row.internal_entity_id, 'active', v_row.active);
      update app_private.football_provider_mappings
      set external_id = coalesce(p.new_external_id, external_id),
          internal_entity_id = coalesce(p.new_app_player_id, internal_entity_id),
          active = case p.kind when 'deactivate' then false when 'reactivate' then true else active end,
          source_version = v_source,
          last_seen_at = statement_timestamp(),
          manually_corrected = true,
          correction_reason = p.reason,
          corrected_by = v_approver_user,
          corrected_at = statement_timestamp()
      where id = v_row.id
      returning * into v_row;
      v_after := jsonb_build_object('mappingId', v_row.id, 'provider', v_row.provider_name,
        'externalId', v_row.external_id, 'appPlayerId', v_row.internal_entity_id, 'active', v_row.active);
      perform app_private.football_mapping_resync_candidate(v_row.provider_name, v_old_ext);
      perform app_private.football_mapping_resync_candidate(v_row.provider_name, v_row.external_id);

    elsif p.kind = 'ignore' then
      select * into v_candidate from app_private.football_player_mapping_candidates
      where id = coalesce(p.sofascore_candidate_id, p.flashscore_candidate_id) for update;
      if v_candidate.lineup_or_incident_seen then
        raise exception using errcode = 'PT409', message = 'ignore_refused_id_in_lineup';
      end if;
      v_before := jsonb_build_object('candidateId', v_candidate.id, 'status', v_candidate.status);
      update app_private.football_player_mapping_candidates set status = 'ignored' where id = v_candidate.id;
      v_after := jsonb_build_object('candidateId', v_candidate.id, 'status', 'ignored');

    else -- reverse_ignore
      select * into v_candidate from app_private.football_player_mapping_candidates
      where id = coalesce(p.sofascore_candidate_id, p.flashscore_candidate_id) for update;
      v_before := jsonb_build_object('candidateId', v_candidate.id, 'status', v_candidate.status);
      update app_private.football_player_mapping_candidates set status = 'unmapped' where id = v_candidate.id;
      v_after := jsonb_build_object('candidateId', v_candidate.id, 'status', 'unmapped');
    end if;

    update app_private.football_player_mapping_proposals
    set status = 'executed', executed_by = v_actor, executed_at = statement_timestamp(),
        executed_before = v_before, executed_after = v_after,
        execution_idempotency_key = p_idempotency_key
    where id = p.id;
  exception
    when unique_violation then v_refusal := 'already_mapped';
    when sqlstate 'PT409' then get stacked diagnostics v_refusal = message_text;
  end;

  if v_refusal is not null then
    -- The block rolled back: the mapping table is exactly as it was. Remember why.
    v_hold := app_private.football_mapping_hold_status(v_refusal);
    update app_private.football_player_mapping_proposals
    set status = v_hold, hold_code = v_refusal where id = p.id;
    perform app_private.football_mapping_release_candidates(p.id);
    select * into p from app_private.football_player_mapping_proposals where id = p.id;
    perform app_private.football_mapping_audit(v_actor, 'football.mapping_held', p,
      'Execution refused, nothing written: ' || v_refusal, p_idempotency_key);
    return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_execute',
      p_idempotency_key, jsonb_build_object('ok', false, 'code', v_refusal, 'status', p.status));
  end if;

  select * into p from app_private.football_player_mapping_proposals where id = p.id;
  perform app_private.football_mapping_audit(v_actor, 'football.mapping_executed', p,
    p.decision_reason, p_idempotency_key, v_before,
    jsonb_build_object('after', v_after, 'requestedBy', p.requested_by, 'decidedBy', p.decided_by,
      'executedBy', p.executed_by, 'requestedAt', p.requested_at, 'decidedAt', p.decided_at,
      'executedAt', p.executed_at, 'reason', p.reason));
  return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_execute',
    p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status,
      'before', v_before, 'after', v_after));
end;
$$;

-- ===========================================================================
-- Reads (staff: football.read_operations or football.manage_mappings)
-- ===========================================================================
create function app_private.football_mapping_require_reader(p_principal uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app_private.admin_has_permission(p_principal, 'football.read_operations')
    or app_private.admin_has_permission(p_principal, 'football.manage_mappings')) then
    raise exception using errcode = 'PT403', message = 'permission_missing';
  end if;
end;
$$;

create function app_private.football_mapping_candidate_json(p_candidate app_private.football_player_mapping_candidates)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_candidate.id,
    'provider', p_candidate.provider_name,
    'externalId', p_candidate.external_id,
    'status', p_candidate.status,
    'statusChangedAt', p_candidate.status_changed_at,
    'existingMappingId', p_candidate.existing_mapping_id,
    'displayName', p_candidate.display_name,
    'displayNamePurgedAt', p_candidate.display_name_purged_at,
    'lineupOrIncidentSeen', p_candidate.lineup_or_incident_seen,
    'evidenceRevision', p_candidate.evidence_revision,
    'flags', to_jsonb(array_remove(array[
      case when (select count(*) from app_private.football_player_mapping_observations o
        where o.candidate_id = p_candidate.id) > 1 then 'MULTI_SQUAD_OBSERVATION' end,
      case when exists (select 1 from app_private.football_player_mapping_observations o
        where o.candidate_id = p_candidate.id and o.squad_completeness = 'INCOMPLETE_PROVIDER_SQUAD')
        then 'INCOMPLETE_PROVIDER_SQUAD' end,
      case when exists (select 1 from app_private.football_player_mapping_observations o
        where o.candidate_id = p_candidate.id and o.registered_team_disagreement)
        then 'REGISTERED_TEAM_DISAGREEMENT' end
    ], null)),
    'observations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'providerTeamId', o.provider_team_id, 'clubKey', o.club_key, 'appTeamId', o.app_team_id,
        'squadCompleteness', o.squad_completeness, 'registeredTeamId', o.registered_team_id,
        'registeredTeamDisagreement', o.registered_team_disagreement,
        'shirtNumber', o.shirt_number, 'position', o.position_signal, 'dobState', o.dob_state,
        'dobJanuary1', o.dob_january1, 'heightCm', o.height_cm,
        'nationality', o.nationality_signal, 'observedAt', o.observed_at)
        order by o.provider_team_id)
      from app_private.football_player_mapping_observations o where o.candidate_id = p_candidate.id), '[]'::jsonb),
    'openProposalId', (select p.id from app_private.football_player_mapping_proposals p
      where (p.sofascore_candidate_id = p_candidate.id or p.flashscore_candidate_id = p_candidate.id)
        and p.status in ('pending', 'approved', 'position_disagreement', 'stale_evidence') limit 1));
$$;

create function api.admin_football_mapping_list_candidates(
  p_status text default null,
  p_provider text default null,
  p_limit integer default 50,
  p_after uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  if p_status is not null and p_status not in ('unmapped', 'proposed', 'mapped', 'ignored') then
    raise exception using errcode = 'PT400', message = 'invalid_filter';
  end if;
  if p_provider is not null and p_provider not in ('sofascore', 'flashscore') then
    raise exception using errcode = 'PT400', message = 'invalid_filter';
  end if;
  return coalesce((
    select jsonb_agg(app_private.football_mapping_candidate_json(c) order by c.id)
    from (
      select * from app_private.football_player_mapping_candidates c
      where (p_status is null or c.status = p_status)
        and (p_provider is null or c.provider_name = p_provider)
        and (p_after is null or c.id > p_after)
      order by c.id
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) c), '[]'::jsonb);
end;
$$;

create function api.admin_football_mapping_get_candidate(p_candidate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
  c app_private.football_player_mapping_candidates%rowtype;
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  select * into c from app_private.football_player_mapping_candidates where id = p_candidate_id;
  if not found then raise exception using errcode = 'PT404', message = 'candidate_not_found'; end if;
  return app_private.football_mapping_candidate_json(c);
end;
$$;

create function app_private.football_mapping_proposal_json(
  p app_private.football_player_mapping_proposals,
  p_viewer uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'batchId', p.batch_id, 'kind', p.kind, 'status', p.status,
    'effectiveStatus', case
      when p.status in ('pending', 'position_disagreement', 'stale_evidence')
        and statement_timestamp() > p.expires_at then 'expired'
      when p.status = 'approved' and statement_timestamp() > p.decided_at + interval '24 hours' then 'expired'
      else p.status end,
    'sofascoreCandidateId', p.sofascore_candidate_id, 'flashscoreCandidateId', p.flashscore_candidate_id,
    'sofascoreExternalId', p.sofascore_external_id, 'flashscoreExternalId', p.flashscore_external_id,
    'providerName', p.provider_name, 'mappingId', p.mapping_id, 'appPlayerId', p.app_player_id,
    'newExternalId', p.new_external_id, 'newAppPlayerId', p.new_app_player_id,
    'expectedBefore', p.expected_before, 'basis', p.basis, 'evidence', p.evidence, 'signals', p.signals,
    'positionDisagreement', p.position_disagreement, 'positionNote', p.position_note,
    'positionDisagreementAcknowledged', p.position_disagreement_acknowledged,
    'reason', p.reason, 'requestedBy', p.requested_by, 'requestedAt', p.requested_at,
    'expiresAt', p.expires_at, 'decidedBy', p.decided_by, 'decidedAt', p.decided_at,
    'decisionReason', p.decision_reason, 'fingerprint', p.fingerprint,
    'executedBy', p.executed_by, 'executedAt', p.executed_at,
    'executedBefore', p.executed_before, 'executedAfter', p.executed_after,
    'holdCode', p.hold_code,
    'proposedByMe', p.requested_by = p_viewer,
    'canApprove', p.status = 'pending' and p.requested_by <> p_viewer
      and statement_timestamp() <= p.expires_at);
$$;

create function api.admin_football_mapping_list_proposals(
  p_status text default null,
  p_limit integer default 50,
  p_after uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  if p_status is not null and p_status not in ('open', 'pending', 'approved', 'executed', 'rejected',
    'expired', 'cancelled', 'stale_evidence', 'identity_conflict', 'position_disagreement', 'already_mapped') then
    raise exception using errcode = 'PT400', message = 'invalid_filter';
  end if;
  return coalesce((
    select jsonb_agg(app_private.football_mapping_proposal_json(p, v_viewer) order by p.id)
    from (
      select * from app_private.football_player_mapping_proposals p
      where (p_status is null
          or (p_status = 'open' and p.status in ('pending', 'approved', 'position_disagreement', 'stale_evidence'))
          or p.status = p_status)
        and (p_after is null or p.id > p_after)
      order by p.id
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) p), '[]'::jsonb);
end;
$$;

create function api.admin_football_mapping_get_proposal(p_proposal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
  p app_private.football_player_mapping_proposals%rowtype;
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  select * into p from app_private.football_player_mapping_proposals where id = p_proposal_id;
  if not found then raise exception using errcode = 'PT404', message = 'proposal_not_found'; end if;
  return app_private.football_mapping_proposal_json(p, v_viewer);
end;
$$;

-- The count behind "second qualified reviewer required" (decision D4).
create function api.admin_football_mapping_reviewer_availability()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
  v_count integer;
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  select count(*) into v_count
  from app_private.staff_principals sp
  where sp.status = 'active' and sp.id <> v_viewer
    and app_private.admin_has_permission(sp.id, 'football.manage_mappings')
    and app_private.admin_has_verified_mfa(sp.auth_user_id);
  return jsonb_build_object('qualifiedReviewersAvailable', v_count,
    'secondReviewerRequired', v_count = 0);
end;
$$;

-- App players for the reviewer to choose from, ranked by agreement. Position
-- never filters, a missing value never lowers a rank, nobody is dropped.
create function api.admin_football_mapping_app_player_options(
  p_candidate_id uuid,
  p_app_team_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
  c app_private.football_player_mapping_candidates%rowtype;
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  select * into c from app_private.football_player_mapping_candidates where id = p_candidate_id;
  if not found then raise exception using errcode = 'PT404', message = 'candidate_not_found'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'appPlayerId', ranked.id, 'displayName', ranked.display_name,
        'position', app_private.football_mapping_position_letter(ranked.position),
        'signals', ranked.signals, 'score', ranked.score,
        'alreadyMappedForProvider', ranked.mapped) order by ranked.score desc, ranked.id)
    from (
      select scored.*
      from (
        select pl.id, pl.display_name, pl.position, signal.signals,
          app_private.football_mapping_signal_score(signal.signals) as score,
          exists (select 1 from app_private.football_provider_mappings m
            where m.provider_name = c.provider_name and m.entity_type = 'player'
              and m.internal_entity_id = pl.id) as mapped
        from (
          select * from app.players pool
          where pool.active
            and (p_app_team_id is null or exists (select 1 from app.team_memberships m
              where m.player_id = pool.id and m.team_id = p_app_team_id and m.active))
          order by pool.id
          limit 2000
        ) pl
        cross join lateral (select app_private.football_mapping_candidate_signals(c.id, pl.id) as signals) signal
      ) scored
      order by scored.score desc, scored.id
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) ranked), '[]'::jsonb);
end;
$$;

-- ===========================================================================
-- Trusted writes (service_role): the builder, the sweeper, the name purge
-- ===========================================================================
-- Records what the read-only collector saw. Writes only the candidate and
-- observation tables: never a mapping, a proposal, a player or a score.
create function api.football_mapping_record_observations(p_observations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_candidate_id uuid;
  v_created integer := 0;
  v_seen integer := 0;
  v_obs_new integer := 0;
  v_obs_changed integer := 0;
  v_bumped integer := 0;
  v_provider text;
  v_external text;
  v_existing app_private.football_player_mapping_observations%rowtype;
  v_status text;
  v_mapping app_private.football_provider_mappings%rowtype;
  v_changed boolean;
  v_dob_state text;
  v_birth date;
begin
  if p_observations is null or jsonb_typeof(p_observations) <> 'array'
    or jsonb_array_length(p_observations) > 2000 then
    raise exception using errcode = 'PT400', message = 'invalid_observations';
  end if;
  for v_item in select value from jsonb_array_elements(p_observations) loop
    v_provider := v_item ->> 'provider';
    v_external := v_item ->> 'externalPlayerId';
    if v_provider not in ('sofascore', 'flashscore') or v_external is null
      or char_length(btrim(v_external)) not between 1 and 200 then
      raise exception using errcode = 'PT400', message = 'invalid_observations';
    end if;
    v_dob_state := coalesce(v_item ->> 'dobState', 'missing');
    v_birth := case when v_dob_state = 'valid' then (v_item ->> 'birthDate')::date end;

    select id into v_candidate_id from app_private.football_player_mapping_candidates
    where provider_name = v_provider and external_id = v_external;
    if v_candidate_id is null then
      select * into v_mapping from app_private.football_provider_mappings
      where provider_name = v_provider and entity_type = 'player' and external_id = v_external;
      v_status := case when v_mapping.id is null then 'unmapped'
        when v_mapping.active then 'mapped' else 'unmapped' end;
      insert into app_private.football_player_mapping_candidates (
        provider_name, external_id, status, existing_mapping_id, display_name, lineup_or_incident_seen)
      values (v_provider, v_external, v_status, v_mapping.id,
        nullif(btrim(v_item ->> 'displayName'), ''),
        coalesce((v_item ->> 'seenInLineupOrIncident')::boolean, false))
      returning id into v_candidate_id;
      v_created := v_created + 1;
    end if;
    v_seen := v_seen + 1;

    select * into v_existing from app_private.football_player_mapping_observations
    where candidate_id = v_candidate_id and provider_team_id = v_item ->> 'providerTeamId' for update;
    if not found then
      insert into app_private.football_player_mapping_observations (
        candidate_id, provider_team_id, club_key, app_team_id, squad_completeness, registered_team_id,
        registered_team_disagreement, shirt_number, position_signal, dob_state, provider_birth_date,
        dob_january1, height_cm, nationality_signal)
      values (v_candidate_id, v_item ->> 'providerTeamId', nullif(v_item ->> 'clubKey', ''),
        nullif(v_item ->> 'appTeamId', '')::uuid,
        coalesce(v_item ->> 'squadCompleteness', 'COMPLETE'),
        nullif(v_item ->> 'registeredTeamId', ''),
        coalesce((v_item ->> 'registeredTeamDisagreement')::boolean, false),
        nullif(v_item ->> 'shirtNumber', '')::smallint, nullif(v_item ->> 'positionSignal', ''),
        v_dob_state, v_birth, coalesce((v_item ->> 'dobJanuary1')::boolean, false),
        nullif(v_item ->> 'heightCm', '')::smallint, nullif(v_item ->> 'nationalitySignal', ''));
      v_obs_new := v_obs_new + 1;
      v_changed := true;
    else
      v_changed := (v_existing.squad_completeness, v_existing.registered_team_id,
          v_existing.registered_team_disagreement, v_existing.shirt_number, v_existing.position_signal,
          v_existing.dob_state, v_existing.provider_birth_date, v_existing.dob_january1,
          v_existing.height_cm, v_existing.nationality_signal, v_existing.app_team_id)
        is distinct from (coalesce(v_item ->> 'squadCompleteness', 'COMPLETE'),
          nullif(v_item ->> 'registeredTeamId', ''),
          coalesce((v_item ->> 'registeredTeamDisagreement')::boolean, false),
          nullif(v_item ->> 'shirtNumber', '')::smallint, nullif(v_item ->> 'positionSignal', ''),
          v_dob_state, v_birth, coalesce((v_item ->> 'dobJanuary1')::boolean, false),
          nullif(v_item ->> 'heightCm', '')::smallint, nullif(v_item ->> 'nationalitySignal', ''),
          nullif(v_item ->> 'appTeamId', '')::uuid);
      update app_private.football_player_mapping_observations
      set squad_completeness = coalesce(v_item ->> 'squadCompleteness', 'COMPLETE'),
          registered_team_id = nullif(v_item ->> 'registeredTeamId', ''),
          registered_team_disagreement = coalesce((v_item ->> 'registeredTeamDisagreement')::boolean, false),
          shirt_number = nullif(v_item ->> 'shirtNumber', '')::smallint,
          position_signal = nullif(v_item ->> 'positionSignal', ''),
          dob_state = v_dob_state, provider_birth_date = v_birth,
          dob_january1 = coalesce((v_item ->> 'dobJanuary1')::boolean, false),
          height_cm = nullif(v_item ->> 'heightCm', '')::smallint,
          nationality_signal = nullif(v_item ->> 'nationalitySignal', ''),
          app_team_id = nullif(v_item ->> 'appTeamId', '')::uuid,
          club_key = nullif(v_item ->> 'clubKey', ''),
          observed_at = statement_timestamp()
      where id = v_existing.id;
      if v_changed then v_obs_changed := v_obs_changed + 1; end if;
    end if;

    update app_private.football_player_mapping_candidates
    set last_observed_at = statement_timestamp(),
        evidence_revision = evidence_revision + case when v_changed then 1 else 0 end,
        lineup_or_incident_seen = lineup_or_incident_seen
          or coalesce((v_item ->> 'seenInLineupOrIncident')::boolean, false),
        -- A reviewer reads the name while the decision is open; mapped and ignored
        -- candidates keep the retention rule (no refill after the purge).
        display_name = case when status in ('unmapped', 'proposed')
          then coalesce(nullif(btrim(v_item ->> 'displayName'), ''), display_name) else display_name end
    where id = v_candidate_id;
    if v_changed then v_bumped := v_bumped + 1; end if;
  end loop;
  return jsonb_build_object('candidatesCreated', v_created, 'observationsSeen', v_seen,
    'observationsCreated', v_obs_new, 'observationsChanged', v_obs_changed, 'revisionsBumped', v_bumped);
end;
$$;

create function api.football_mapping_expire_proposals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  p app_private.football_player_mapping_proposals%rowtype;
  v_count integer := 0;
begin
  for p in
    select * from app_private.football_player_mapping_proposals
    where (status in ('pending', 'position_disagreement', 'stale_evidence') and expires_at < statement_timestamp())
      or (status = 'approved' and decided_at < statement_timestamp() - interval '24 hours')
    order by requested_at
    for update skip locked
  loop
    update app_private.football_player_mapping_proposals set status = 'expired' where id = p.id;
    perform app_private.football_mapping_release_candidates(p.id);
    select * into p from app_private.football_player_mapping_proposals where id = p.id;
    perform app_private.football_mapping_audit(null, 'football.mapping_expired', p,
      'The proposal was not decided or executed in time.', null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Retention (decision D3): ONLY the provider's display name, 90 days after the
-- candidate became mapped or ignored. Ids, signals, fingerprints, decisions
-- and audit events stay.
create function api.football_mapping_purge_display_names()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update app_private.football_player_mapping_candidates
  set display_name = null, display_name_purged_at = statement_timestamp()
  where status in ('mapped', 'ignored')
    and display_name is not null
    and status_changed_at < statement_timestamp() - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ===========================================================================
-- The one existing path that could write a player mapping for the new providers
-- ===========================================================================
-- api.resolve_football_mapping (service_role, used by the SportsMonks
-- ingestion) inserts a mapping row for any registered provider. Once sofascore
-- and flashscore are registered it could therefore create their PLAYER mappings
-- with no proposer, no second person and no audit. This adds exactly one guard
-- and changes nothing else: a player mapping for either reviewed provider is
-- refused (MAPPING_REVIEW_REQUIRED) before the insert. Every other provider and
-- entity behaves as before, and no code calls it for these providers today.
-- The preflight pins the text it was reviewed against (md5 read on production
-- on 1 Oct 2026), so a drifted definition stops this migration instead of
-- being overwritten.
do $guard_preflight$
begin
  if md5(pg_get_functiondef('api.resolve_football_mapping(text,text,text,uuid,text,timestamptz)'::regprocedure))
    <> '5d7ad20856e2bb22e2b7d44741e21be1' then
    raise exception 'football_player_mapping: api.resolve_football_mapping is not the text this migration was reviewed against';
  end if;
end
$guard_preflight$;

create or replace function api.resolve_football_mapping(
  p_provider_name text,
  p_entity_type text,
  p_external_id text,
  p_internal_entity_id uuid default null,
  p_source_version text default null,
  p_last_seen_at timestamp with time zone default statement_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  mapped_id uuid;
  normalized_entity_type app_private.football_entity_type;
begin
  if p_entity_type not in (
    'country', 'competition', 'season', 'round', 'venue', 'team',
    'player', 'fixture', 'event'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ENTITY_TYPE';
  end if;
  normalized_entity_type := p_entity_type::app_private.football_entity_type;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider_name || ':' || p_entity_type || ':' || p_external_id, 0)
  );

  select mapping.internal_entity_id into mapped_id
  from app_private.football_provider_mappings mapping
  where mapping.provider_name = p_provider_name
    and mapping.entity_type = normalized_entity_type
    and mapping.external_id = p_external_id
    and mapping.active;

  if mapped_id is not null then
    if p_internal_entity_id is not null and mapped_id <> p_internal_entity_id then
      raise exception using errcode = 'P0001', message = 'MAPPING_COLLISION';
    end if;
    update app_private.football_provider_mappings
    set last_seen_at = greatest(last_seen_at, p_last_seen_at),
        source_version = coalesce(p_source_version, source_version)
    where provider_name = p_provider_name
      and entity_type = normalized_entity_type
      and external_id = p_external_id;
    return mapped_id;
  end if;

  if p_internal_entity_id is null then
    raise exception using errcode = 'P0002', message = 'MAPPING_NOT_FOUND';
  end if;

  -- The only change: a reviewed provider's player mapping is never created here.
  if p_provider_name in ('sofascore', 'flashscore') and normalized_entity_type = 'player' then
    raise exception using errcode = 'P0001', message = 'MAPPING_REVIEW_REQUIRED';
  end if;

  begin
    insert into app_private.football_provider_mappings (
      provider_name, entity_type, external_id, internal_entity_id,
      source_version, last_seen_at
    ) values (
      p_provider_name, normalized_entity_type, p_external_id,
      p_internal_entity_id, p_source_version, p_last_seen_at
    );
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'MAPPING_COLLISION';
  end;
  return p_internal_entity_id;
end;
$$;

-- ===========================================================================
-- Privileges
-- ===========================================================================
revoke all on function
  app_private.football_mapping_position_letter(app.football_position),
  app_private.football_mapping_dob_signal(date, text, date, boolean, date),
  app_private.football_mapping_candidate_signals(uuid, uuid),
  app_private.football_mapping_signal_score(jsonb),
  app_private.football_mapping_row_fingerprint(app_private.football_player_mapping_proposals),
  app_private.football_mapping_refuse(text),
  app_private.football_mapping_compute(text, uuid, uuid, text, uuid, uuid, text, uuid, uuid),
  app_private.football_mapping_hold_status(text),
  app_private.football_mapping_revalidate(uuid),
  app_private.football_mapping_resync_candidate(text, text),
  app_private.football_mapping_release_candidates(uuid),
  app_private.football_mapping_audit(uuid, text, app_private.football_player_mapping_proposals, text, uuid, jsonb, jsonb),
  app_private.football_mapping_require_reader(uuid),
  app_private.football_mapping_candidate_json(app_private.football_player_mapping_candidates),
  app_private.football_mapping_proposal_json(app_private.football_player_mapping_proposals, uuid)
from public, anon, authenticated, service_role;

revoke all on function
  api.admin_football_mapping_propose(jsonb, text, uuid),
  api.admin_football_mapping_add_position_note(uuid, text, uuid),
  api.admin_football_mapping_refresh_evidence(uuid, uuid),
  api.admin_football_mapping_cancel(uuid, text, uuid),
  api.admin_football_mapping_decide(uuid, text, text, text, boolean, uuid),
  api.admin_football_mapping_execute(uuid, uuid),
  api.admin_football_mapping_list_candidates(text, text, integer, uuid),
  api.admin_football_mapping_get_candidate(uuid),
  api.admin_football_mapping_list_proposals(text, integer, uuid),
  api.admin_football_mapping_get_proposal(uuid),
  api.admin_football_mapping_reviewer_availability(),
  api.admin_football_mapping_app_player_options(uuid, uuid, integer),
  api.football_mapping_record_observations(jsonb),
  api.football_mapping_expire_proposals(),
  api.football_mapping_purge_display_names()
from public, anon, authenticated, service_role;

-- Staff, through the browser session: authority is checked inside each function.
grant execute on function
  api.admin_football_mapping_propose(jsonb, text, uuid),
  api.admin_football_mapping_add_position_note(uuid, text, uuid),
  api.admin_football_mapping_refresh_evidence(uuid, uuid),
  api.admin_football_mapping_cancel(uuid, text, uuid),
  api.admin_football_mapping_decide(uuid, text, text, text, boolean, uuid),
  api.admin_football_mapping_execute(uuid, uuid),
  api.admin_football_mapping_list_candidates(text, text, integer, uuid),
  api.admin_football_mapping_get_candidate(uuid),
  api.admin_football_mapping_list_proposals(text, integer, uuid),
  api.admin_football_mapping_get_proposal(uuid),
  api.admin_football_mapping_reviewer_availability(),
  api.admin_football_mapping_app_player_options(uuid, uuid, integer)
to authenticated;

-- Trusted jobs: the service role only. Never a browser role.
grant execute on function
  api.football_mapping_record_observations(jsonb),
  api.football_mapping_expire_proposals(),
  api.football_mapping_purge_display_names()
to service_role;

comment on function api.admin_football_mapping_propose(jsonb, text, uuid) is
  'Staff (football.manage_mappings, AAL2, recent authentication): propose up to 100 mapping decisions as one batch. Creates pending proposals only; nothing is mapped.';
comment on function api.admin_football_mapping_decide(uuid, text, text, text, boolean, uuid) is
  'Staff (football.manage_mappings, AAL2, recent authentication): a DIFFERENT human approves or rejects the exact fingerprint. Self-approval is refused here and by a table check.';
comment on function api.admin_football_mapping_execute(uuid, uuid) is
  'Staff (football.manage_mappings, AAL2, recent authentication): executes one approved proposal exactly once, in one guarded transaction. Replace, deactivate and reactivate update the existing mapping row.';
comment on function api.football_mapping_record_observations(jsonb) is
  'Service role: records what the read-only squad collector saw as candidates and observations. Never writes a mapping, proposal, player or score.';
comment on function api.football_mapping_purge_display_names() is
  'Service role: nulls provider display names 90 days after a candidate became mapped or ignored; nothing else is purged.';
