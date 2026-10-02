-- Single-approver switch for the player-mapping workflow.
--
-- Owner decision, 2026-10-02: while BotolaGO has one qualified operator, that
-- operator may approve their own mapping proposal. This is a SWITCH, not the
-- removal of the two-person design: turn it off and the second-person rule
-- returns with no further change. Forward-only: 20261001160000 and
-- 20261001161000 are untouched; the functions below are replaced.
--
-- What stays exactly as it was, for a self-approval too:
--   * football.manage_mappings, AAL2 and recent authentication on every call;
--   * a written reason, and approval of the exact fingerprint shown;
--   * the evidence re-check at approval and again at execution;
--   * proposals expire after 72 hours, an approval after 24 hours;
--   * execution stays a separate call, nothing here executes anything;
--   * no wait between proposing and approving (owner decision).
-- What is new: the audit trail records selfApproved, the proposal carries a
-- generated self_approved flag, and an approval the proposer gave themselves
-- stops being executable the moment the switch is turned off.

-- ---------------------------------------------------------------------------
-- The switch: one row, on, changed only by a guarded script the owner runs.
-- ---------------------------------------------------------------------------
create table app_private.football_mapping_settings (
  singleton boolean primary key default true,
  allow_self_approval boolean not null,
  updated_at timestamptz not null default statement_timestamp(),
  constraint football_mapping_settings_singleton_check check (singleton)
);
insert into app_private.football_mapping_settings (singleton, allow_self_approval) values (true, true);
alter table app_private.football_mapping_settings enable row level security;
alter table app_private.football_mapping_settings force row level security;
revoke all on table app_private.football_mapping_settings from public, anon, authenticated, service_role;
comment on table app_private.football_mapping_settings is
  'One row. allow_self_approval = true lets the person who proposed a mapping also approve it (single-operator mode). Set to false to require two different people again.';

create function app_private.football_mapping_self_approval_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select allow_self_approval from app_private.football_mapping_settings where singleton), false);
$$;
revoke all on function app_private.football_mapping_self_approval_allowed()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The table: a self-approval is recorded as such, and refused when the switch is off.
-- ---------------------------------------------------------------------------
alter table app_private.football_player_mapping_proposals
  add column self_approved boolean
  generated always as (decided_by is not null and decided_by = requested_by) stored;
alter table app_private.football_player_mapping_proposals
  drop constraint football_player_mapping_proposals_two_people_check;

create function app_private.football_mapping_self_decision_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app_private.football_mapping_self_approval_allowed() then
    raise exception using errcode = 'PT403', message = 'self_approval_denied';
  end if;
  return new;
end;
$$;
revoke all on function app_private.football_mapping_self_decision_guard()
  from public, anon, authenticated, service_role;
create trigger football_player_mapping_proposals_self_decision_guard
  before update on app_private.football_player_mapping_proposals
  for each row
  when (new.decided_by is not null and new.decided_by = new.requested_by
    and old.decided_by is distinct from new.decided_by)
  execute function app_private.football_mapping_self_decision_guard();

-- ---------------------------------------------------------------------------
-- The functions that used to refuse a self-approval outright
-- ---------------------------------------------------------------------------
create or replace function api.admin_football_mapping_decide(
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
  if p.requested_by = v_actor and not app_private.football_mapping_self_approval_allowed() then
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
    perform app_private.football_mapping_audit(v_actor, 'football.mapping_rejected', p, v_reason, p_idempotency_key,
      null, jsonb_build_object('selfDecided', p.self_approved));
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
  perform app_private.football_mapping_audit(v_actor, 'football.mapping_approved', p, v_reason, p_idempotency_key,
    null, jsonb_build_object('selfApproved', p.self_approved));
  return app_private.admin_complete_idempotent_operation(v_actor, 'football.mapping_decide',
    p_idempotency_key, jsonb_build_object('ok', true, 'id', p.id, 'status', p.status,
      'fingerprint', p.fingerprint, 'selfApproved', p.self_approved));
end;
$$;

create or replace function api.admin_football_mapping_execute(
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
$$;

-- ===========================================================================
-- Reads (staff: football.read_operations or football.manage_mappings)
-- ===========================================================================

create or replace function app_private.football_mapping_proposal_json(
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
    'selfApproved', p.self_approved,
    'canApprove', p.status = 'pending'
      and (p.requested_by <> p_viewer or app_private.football_mapping_self_approval_allowed())
      and statement_timestamp() <= p.expires_at);
$$;

create or replace function api.admin_football_mapping_reviewer_availability()
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
    'selfApprovalAllowed', app_private.football_mapping_self_approval_allowed(),
    'secondReviewerRequired', v_count = 0 and not app_private.football_mapping_self_approval_allowed());
end;
$$;

comment on function api.admin_football_mapping_decide(uuid, text, text, text, boolean, uuid) is
  'Staff (football.manage_mappings, AAL2, recent authentication): approves or rejects the exact fingerprint. The proposer may decide their own proposal only while app_private.football_mapping_settings.allow_self_approval is true; otherwise a DIFFERENT human is required.';
