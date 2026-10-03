-- A Flashscore identity is mapped only while the Sofascore mapping it rests on is, in the database,
-- exactly what the reviewer saw: the same row, still active, still reviewed, still on the same
-- canonical player, in the same state. Today that is checked by the client only; this migration makes
-- the database enforce it in the trusted lifecycle, in the transaction that writes the mapping.
--
-- What changes (and nothing else):
--   1. api.admin_football_mapping_get_provider_mapping: a staff read of the ACTUAL mapping row, with
--      its review state and provenance computed from the row and the audit record, never from a
--      version-string prefix alone.
--   2. Two proposal columns (evidence_class, supporting_mapping_id), immutable, required for every
--      Flashscore-only map and for a Flashscore replace or reactivate, and refused everywhere else.
--      (A proposal that maps a Sofascore AND a Flashscore identity together creates both in one
--      reviewed transaction and rests on nothing outside it: it takes no dependency.) The
--      supporting mapping's state is read by the SERVER, stored in the proposal's evidence, and so
--      part of its fingerprint; it is re-read at approval and again, locked, at execution.
--   3. Execution locks the supporting mapping (SHARE, after the proposal and before the candidates and
--      the mapping table: one lock order) and refuses with a stable code, writing nothing, when it is
--      missing, inactive, unreviewed, on another player, or changed.
-- Sofascore proposals, their fingerprints and the 191 completed mappings are untouched.
-- Single-approver mode, AAL2, recent sign-in, permissions, idempotency, the audit trail, the mapping
-- table's unique constraints and the generic resolver's MAPPING_REVIEW_REQUIRED guard are unchanged.
-- The server validates the stored provenance and the dependency; it does not claim to have verified
-- the provider's match events or birth dates themselves.

-- ===========================================================================
-- Preflight: this migration replaces functions whose text was reviewed. Apply it only onto exactly that.
-- ===========================================================================
do $guard_preflight$
declare
  v record;
begin
  for v in
    select * from (values
      ('app_private.football_mapping_compute(text,uuid,uuid,text,uuid,uuid,text,uuid,uuid)', '36269e06556de5376c4ba9208278b4c4'),
      ('api.admin_football_mapping_propose(jsonb,text,uuid)', 'f5d0763b027e80822266da71fa7ecbfa'),
      ('app_private.football_mapping_revalidate(uuid)', '13e0707e390ec73af8ff4255f9986927'),
      ('api.admin_football_mapping_refresh_evidence(uuid,uuid)', 'e7d0e0ac179efc20a13149ff832ae60f'),
      ('api.admin_football_mapping_execute(uuid,uuid)', '1c0951a9f61cf0baa2970b720b90cfb4'),
      ('app_private.football_mapping_proposal_guard()', '9a09d8f704c30f18cd544c7455dc665d')
    ) as t(signature, expected)
  loop
    if to_regprocedure(v.signature) is null
      or md5(pg_get_functiondef(v.signature::regprocedure)) <> v.expected then
      raise exception 'football_mapping supporting dependency: % is not the text this migration was reviewed against', v.signature;
    end if;
  end loop;
  if exists (select 1 from information_schema.columns
    where table_schema = 'app_private' and table_name = 'football_player_mapping_proposals'
      and column_name in ('evidence_class', 'supporting_mapping_id')) then
    raise exception 'football_mapping supporting dependency: the proposal columns already exist';
  end if;
end
$guard_preflight$;

-- ===========================================================================
-- 1. The proposal's dependency columns (immutable; the evidence carries the state)
-- ===========================================================================
alter table app_private.football_player_mapping_proposals
  add column evidence_class text,
  add column supporting_mapping_id uuid;   -- plain uuid on purpose: no foreign key to the mapping table (see its design note)
alter table app_private.football_player_mapping_proposals
  add constraint football_player_mapping_proposals_supporting_check check (
    (evidence_class is null) = (supporting_mapping_id is null)
    and (evidence_class is null
      or evidence_class in ('F1_REVIEWED_SOFASCORE_EVENTS', 'F2_REVIEWED_SOFASCORE_SHIRT_DOB'))
    -- Required for every Flashscore-only map and for a Flashscore replace or reactivate; present nowhere else.
    -- (A proposal mapping a Sofascore AND a Flashscore identity together creates both in one reviewed
    -- transaction and rests on nothing outside it.)
    and ((kind = 'map' and flashscore_candidate_id is not null and sofascore_candidate_id is null)
      or (kind in ('replace', 'reactivate') and provider_name = 'flashscore'))
      = (supporting_mapping_id is not null)
  );
create index football_player_mapping_proposals_supporting_idx
  on app_private.football_player_mapping_proposals (supporting_mapping_id)
  where supporting_mapping_id is not null;

CREATE OR REPLACE FUNCTION app_private.football_mapping_proposal_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  refreshing boolean := coalesce(current_setting('app.football_mapping_refresh', true), '') = 'on';
  allowed boolean;
begin
  if old.status in ('executed', 'rejected', 'expired', 'cancelled', 'identity_conflict', 'already_mapped') then
    raise exception using errcode = '42501', message = 'football_mapping_proposal_is_final';
  end if;

  if new.id is distinct from old.id
    or new.batch_id is distinct from old.batch_id
    or new.kind is distinct from old.kind
    or new.requested_by is distinct from old.requested_by
    or new.requested_at is distinct from old.requested_at
    or new.correlation_id is distinct from old.correlation_id
    or new.sofascore_candidate_id is distinct from old.sofascore_candidate_id
    or new.flashscore_candidate_id is distinct from old.flashscore_candidate_id
    or new.sofascore_external_id is distinct from old.sofascore_external_id
    or new.flashscore_external_id is distinct from old.flashscore_external_id
    or new.provider_name is distinct from old.provider_name
    or new.mapping_id is distinct from old.mapping_id
    or new.app_player_id is distinct from old.app_player_id
    or new.new_external_id is distinct from old.new_external_id
    or new.new_app_player_id is distinct from old.new_app_player_id
    or new.basis is distinct from old.basis
    or new.evidence_class is distinct from old.evidence_class
    or new.supporting_mapping_id is distinct from old.supporting_mapping_id
    or new.reason is distinct from old.reason then
    raise exception using errcode = '42501', message = 'football_mapping_proposal_payload_is_immutable';
  end if;

  if not refreshing and (
    new.expected_before is distinct from old.expected_before
    or new.evidence is distinct from old.evidence
    or new.signals is distinct from old.signals
    or new.candidate_revisions is distinct from old.candidate_revisions
    or new.position_disagreement is distinct from old.position_disagreement
    or new.fingerprint is distinct from old.fingerprint
    or new.expires_at is distinct from old.expires_at
  ) then
    -- The note is added through its own function (position_note below).
    raise exception using errcode = '42501', message = 'football_mapping_proposal_evidence_is_immutable';
  end if;

  if new.position_note is distinct from old.position_note
    and not refreshing
    and coalesce(current_setting('app.football_mapping_note', true), '') <> 'on' then
    raise exception using errcode = '42501', message = 'football_mapping_proposal_note_is_set_by_function';
  end if;

  -- A decision, once made, is only ever cleared by a refresh.
  if old.decided_by is not null and new.decided_by is distinct from old.decided_by and not refreshing then
    raise exception using errcode = '42501', message = 'football_mapping_decision_is_immutable';
  end if;
  if old.executed_at is not null then
    raise exception using errcode = '42501', message = 'football_mapping_proposal_is_final';
  end if;

  if new.status is distinct from old.status then
    allowed := case old.status
      when 'pending' then new.status in ('approved', 'rejected', 'expired', 'cancelled',
        'stale_evidence', 'identity_conflict', 'position_disagreement', 'already_mapped')
      when 'position_disagreement' then new.status in ('pending', 'cancelled', 'expired',
        'stale_evidence', 'identity_conflict', 'already_mapped')
      when 'approved' then new.status in ('executed', 'stale_evidence', 'identity_conflict',
        'already_mapped', 'expired', 'cancelled')
      when 'stale_evidence' then new.status in ('pending', 'position_disagreement', 'cancelled', 'expired')
      else false
    end;
    if not allowed then
      raise exception using errcode = '42501',
        message = 'football_mapping_proposal_transition_refused',
        detail = old.status || ' -> ' || new.status;
    end if;
    if new.status = 'approved' and new.decided_by is null then
      raise exception using errcode = '42501', message = 'football_mapping_approval_needs_a_decider';
    end if;
  end if;
  return new;
end;
$function$;

-- ===========================================================================
-- 2. The mapping row's real state, and the dependency check built on it
-- ===========================================================================
-- Reviewed means ALL of: the row says a person corrected it (manually_corrected, with the reason, the
-- person and the time the table's own check ties to it); its version marker names an EXECUTED proposal;
-- that proposal's audit record shows it wrote this row with this external id, player and active state;
-- the row's reason is that proposal's reason; and the row's corrector is that proposal's approver. A
-- marker string on its own proves nothing: a row edited by hand while the old marker stays no longer
-- matches the audit record and is not reviewed.
create function app_private.football_mapping_supporting_state(p_mapping_id uuid)
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
    'reviewProvenance', case when v_reviewed then 'executed_proposal' else 'none' end,
    'provenanceProposalId', case when v_reviewed then v_pid end,
    'correctedAt', m.corrected_at,
    'sourceVersion', m.source_version,
    'updatedAt', m.updated_at,
    -- Covers every field that makes the row what it is. Not last_seen_at or updated_at: ingestion may
    -- touch those without changing the identity.
    'stateDigest', app_private.admin_payload_fingerprint(jsonb_build_object(
      'id', m.id, 'provider', m.provider_name, 'entityType', m.entity_type::text,
      'externalId', m.external_id, 'appPlayerId', m.internal_entity_id, 'active', m.active,
      'manuallyCorrected', m.manually_corrected, 'correctedBy', m.corrected_by,
      'correctedAt', m.corrected_at, 'correctionReason', m.correction_reason,
      'sourceVersion', m.source_version, 'reviewed', v_reviewed,
      'provenanceProposalId', case when v_reviewed then v_pid end)));
end;
$$;

-- Either {"ok": false, "code": ...} or {"ok": true, "supporting": ...}: the block that goes into the
-- proposal's evidence (and so into its fingerprint) and is compared again at approval and execution.
create function app_private.football_mapping_supporting_dependency(
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
  if not (s ->> 'reviewed')::boolean then
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

revoke all on function
  app_private.football_mapping_supporting_state(uuid),
  app_private.football_mapping_supporting_dependency(text, uuid, uuid)
  from public, anon, authenticated, service_role;

-- ===========================================================================
-- 3. The compute / propose / revalidate / refresh / execute functions, with the dependency in them
-- ===========================================================================
drop function app_private.football_mapping_compute(text, uuid, uuid, text, uuid, uuid, text, uuid, uuid);

create function app_private.football_mapping_compute(p_kind text, p_sofascore_candidate uuid, p_flashscore_candidate uuid, p_provider text, p_mapping_id uuid, p_app_player_id uuid, p_new_external_id text, p_new_app_player_id uuid, p_exclude_proposal uuid DEFAULT NULL::uuid, p_evidence_class text DEFAULT NULL::text, p_supporting_mapping uuid DEFAULT NULL::uuid, p_refs jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_target_candidate uuid;
  v_player_ok boolean;
  v_rev integer;
  v_dep jsonb;
  v_supporting jsonb := null;
begin
  -- Dependency fields mean something only for a Flashscore identity: nowhere else may they be supplied.
  if p_kind in ('ignore', 'reverse_ignore', 'deactivate')
    and (p_evidence_class is not null or p_supporting_mapping is not null) then
    return app_private.football_mapping_refuse('supporting_dependency_not_applicable');
  end if;
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
    if p_flashscore_candidate is not null and p_sofascore_candidate is null then
      -- A Flashscore-only proposal rests on a Sofascore mapping that already exists. The server reads it itself; a caller's say-so is not evidence.
      -- (One proposal that maps a Sofascore AND a Flashscore identity to the same player creates both in one
      -- reviewed transaction and rests on nothing outside it: it takes no dependency, and refuses one.)
      v_dep := app_private.football_mapping_supporting_dependency(p_evidence_class, p_supporting_mapping, p_app_player_id);
      if not (v_dep ->> 'ok')::boolean then
        return app_private.football_mapping_refuse(v_dep ->> 'code');
      end if;
      v_supporting := v_dep -> 'supporting';
    elsif p_evidence_class is not null or p_supporting_mapping is not null then
      return app_private.football_mapping_refuse('supporting_dependency_not_applicable');
    end if;
    return jsonb_build_object('ok', true,
      'sofascoreExternalId', v_sofa_ext, 'flashscoreExternalId', v_flash_ext,
      'providerName', null, 'expectedBefore', null,
      'evidence', jsonb_build_object('candidates', v_evidence_candidates, 'appPlayerId', p_app_player_id)
        || case when v_supporting is null then '{}'::jsonb
          else jsonb_build_object('supporting', v_supporting,
            'refsDigest', app_private.admin_payload_fingerprint(coalesce(p_refs, '[]'::jsonb))) end,
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
    if v_row.provider_name = 'flashscore' and p_kind in ('replace', 'reactivate') then
      -- Changing or restoring a Flashscore identity needs the same dependency, against the target it will have afterwards.
      v_dep := app_private.football_mapping_supporting_dependency(p_evidence_class, p_supporting_mapping, v_target_player);
      if not (v_dep ->> 'ok')::boolean then
        return app_private.football_mapping_refuse(v_dep ->> 'code');
      end if;
      v_supporting := v_dep -> 'supporting';
    elsif p_evidence_class is not null or p_supporting_mapping is not null then
      return app_private.football_mapping_refuse('supporting_dependency_not_applicable');
    end if;
    return jsonb_build_object('ok', true,
      'sofascoreExternalId', null, 'flashscoreExternalId', null,
      'providerName', v_row.provider_name, 'expectedBefore', v_expected,
      'evidence', jsonb_build_object('mappingId', v_row.id, 'before', v_expected,
        'newExternalId', p_new_external_id, 'newAppPlayerId', p_new_app_player_id)
        || case when v_supporting is null then '{}'::jsonb
          else jsonb_build_object('supporting', v_supporting,
            'refsDigest', app_private.admin_payload_fingerprint(coalesce(p_refs, '[]'::jsonb))) end,
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
$function$;

revoke all on function
  app_private.football_mapping_compute(text, uuid, uuid, text, uuid, uuid, text, uuid, uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.football_mapping_revalidate(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p app_private.football_player_mapping_proposals%rowtype;
  v jsonb;
begin
  select * into p from app_private.football_player_mapping_proposals where id = p_id;
  v := app_private.football_mapping_compute(p.kind, p.sofascore_candidate_id, p.flashscore_candidate_id,
    p.provider_name, p.mapping_id, p.app_player_id, p.new_external_id, p.new_app_player_id, p.id,
    p.evidence_class, p.supporting_mapping_id, p.evidence -> 'refs');
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
$function$;

CREATE OR REPLACE FUNCTION api.admin_football_mapping_refresh_evidence(p_proposal_id uuid, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    p.new_external_id, p.new_app_player_id, p.id,
    p.evidence_class, p.supporting_mapping_id, p.evidence -> 'refs');
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
$function$;

CREATE OR REPLACE FUNCTION api.admin_football_mapping_propose(p_items jsonb, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_evidence_class text;
  v_supporting uuid;
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
    v_evidence_class := nullif(v_item ->> 'evidenceClass', '');
    v_supporting := nullif(v_item ->> 'supportingMappingId', '')::uuid;
    if v_kind is null or v_kind not in ('map', 'replace', 'deactivate', 'reactivate', 'ignore', 'reverse_ignore')
      or v_basis not in ('incident', 'shirt_position', 'manual')
      or jsonb_typeof(v_refs) <> 'array' or jsonb_array_length(v_refs) > 20
      or app_private.football_mapping_json_has_name_key(v_refs) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_index, 'ok', false, 'code', 'invalid_proposal'));
      continue;
    end if;
    -- A dependency-bound proposal carries its evidence references: they are part of its fingerprint.
    if (v_evidence_class is not null or v_supporting is not null) and jsonb_array_length(v_refs) = 0 then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'index', v_index, 'ok', false, 'code', 'evidence_refs_required'));
      continue;
    end if;
    v_computed := app_private.football_mapping_compute(
      v_kind, v_sofa, v_flash,
      v_item ->> 'providerName',
      nullif(v_item ->> 'mappingId', '')::uuid,
      nullif(v_item ->> 'appPlayerId', '')::uuid,
      nullif(v_item ->> 'newExternalId', ''),
      nullif(v_item ->> 'newAppPlayerId', '')::uuid,
      null, v_evidence_class, v_supporting, v_refs);
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
    v_row.evidence_class := v_evidence_class;
    v_row.supporting_mapping_id := v_supporting;
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
        requested_by, requested_at, expires_at, fingerprint, correlation_id,
        evidence_class, supporting_mapping_id)
      values (
        v_row.id, v_row.batch_id, v_row.kind, v_row.status, v_row.sofascore_candidate_id,
        v_row.flashscore_candidate_id, v_row.sofascore_external_id, v_row.flashscore_external_id,
        v_row.provider_name, v_row.mapping_id, v_row.app_player_id, v_row.new_external_id,
        v_row.new_app_player_id, v_row.expected_before, v_row.basis, v_row.evidence, v_row.signals,
        v_row.candidate_revisions, v_row.position_disagreement, v_row.reason,
        v_row.requested_by, v_row.requested_at, v_row.expires_at, v_row.fingerprint, v_row.correlation_id,
        v_row.evidence_class, v_row.supporting_mapping_id);
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
$function$;

CREATE OR REPLACE FUNCTION api.admin_football_mapping_execute(p_proposal_id uuid, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_dep jsonb;
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
  if p.decided_by is null
    or app_private.football_mapping_row_fingerprint(p) is distinct from p.fingerprint then
    raise exception using errcode = 'PT409', message = 'fingerprint_mismatch';
  end if;
  -- An approval the proposer gave themselves only stands while the switch that
  -- allows it is still on.
  if p.self_approved and not app_private.football_mapping_self_approval_allowed() then
    raise exception using errcode = 'PT409', message = 'self_approval_no_longer_allowed';
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
    -- The supporting Sofascore mapping, locked and re-read in THIS transaction. Lock order, always:
    -- the proposal (above), the supporting mapping (SHARE), the candidates, then the mapping table.
    -- SHARE blocks a concurrent retarget or deactivation until this transaction ends; if one got there
    -- first, the read below sees its result and refuses.
    if p.supporting_mapping_id is not null then
      perform 1 from app_private.football_provider_mappings m
      where m.id = p.supporting_mapping_id for share;
      v_dep := app_private.football_mapping_supporting_dependency(p.evidence_class, p.supporting_mapping_id,
        case when p.kind = 'map' then p.app_player_id
          else coalesce(p.new_app_player_id, (select m.internal_entity_id from app_private.football_provider_mappings m where m.id = p.mapping_id)) end);
      if not (v_dep ->> 'ok')::boolean then
        raise exception using errcode = 'PT409', message = v_dep ->> 'code';
      end if;
      if v_dep -> 'supporting' is distinct from p.evidence -> 'supporting' then
        raise exception using errcode = 'PT409', message = 'supporting_mapping_changed';
      end if;
    end if;
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
      'executedAt', p.executed_at, 'reason', p.reason,
      'selfApproved', p.self_approved));
  return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_execute',
    p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status,
      'before', v_before, 'after', v_after));
end;
$function$;

-- ===========================================================================
-- 4. The read: the actual mapping row, for staff
-- ===========================================================================
-- Same authorization as the other mapping reads (an authenticated staff principal who may read mapping
-- operations). Returns one row's identity, active state, review state and provenance, and null when no
-- such mapping exists. No name, no birth date, no secret, no other row. The table itself is not exposed.
create function api.admin_football_mapping_get_provider_mapping(
  p_provider text,
  p_external_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := app_private.admin_assert_principal(true, false);
  v_id uuid;
begin
  perform app_private.football_mapping_require_reader(v_viewer);
  if p_provider is null or p_provider not in ('sofascore', 'flashscore')
    or p_external_id is null or char_length(p_external_id) not between 1 and 200 then
    raise exception using errcode = 'PT400', message = 'invalid_filter';
  end if;
  select m.id into v_id from app_private.football_provider_mappings m
  where m.provider_name = p_provider and m.entity_type = 'player' and m.external_id = p_external_id;
  if v_id is null then return null; end if;
  return app_private.football_mapping_supporting_state(v_id);
end;
$$;

revoke all on function api.admin_football_mapping_get_provider_mapping(text, text)
  from public, anon, authenticated, service_role;
grant execute on function api.admin_football_mapping_get_provider_mapping(text, text) to authenticated;
comment on function api.admin_football_mapping_get_provider_mapping(text, text) is
  'Staff: the actual provider player mapping row (identity, active, review state and provenance, state digest). Reads only; no names or dates.';
