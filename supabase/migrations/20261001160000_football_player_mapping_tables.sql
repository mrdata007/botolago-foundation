-- BotolaGO Production V2
-- Player-identity mapping workflow, part 1 of 2: the tables.
-- Design: docs/backend/FANTASY_PLAYER_MAPPING_TABLE_AND_REVIEW_SCREEN_DESIGN.md
-- (owner decisions D1 to D5, A, B, E; shared-id decision of 1 Oct 2026).
--
-- WHAT THIS ADDS (workflow and evidence only; nothing here maps anyone)
--   app_private.football_player_mapping_candidates     one row per PROVIDER
--       identity (provider_name, external_id): the provider's player id and
--       nothing more. A player seen in two squads is still ONE row.
--   app_private.football_player_mapping_observations   where each candidate
--       was seen: one row per (candidate, requested squad/team). A repeat
--       observation under another club is an observation, never a second
--       candidate and never negative evidence.
--   app_private.football_player_mapping_proposals      a durable decision
--       (map, replace, deactivate, reactivate, ignore, reverse_ignore) that
--       needs a second, different human before it can be executed.
--   plus the guard triggers that make a proposal immutable once decided and
--   forbid deleting any of these rows.
--
-- WHAT THIS DOES NOT TOUCH
--   app_private.football_provider_mappings and its two unconditional unique
--   constraints are NOT altered. No column, trigger, index, policy or grant is
--   added to it, and these tables carry no foreign key to it (a foreign key
--   would add triggers to the referenced table), so `mapping_id` below is a
--   plain uuid that the trusted functions of part 2 validate. Nothing in this
--   file inserts, updates or deletes a mapping row, a player, a fixture, a
--   Fantasy row or a score. Applying it creates empty tables.
--
-- NAMES
--   The provider's display name is held on the candidate for a reviewer to
--   read and is purged 90 days after the candidate becomes mapped or ignored.
--   It is never an identity, ranking, fingerprint or evidence input, and the
--   evidence/signals documents refuse any key that looks like a name.
--
-- ACCESS
--   Row level security is forced and there is no policy and no grant: no
--   browser role, and not even service_role, can read or write these tables
--   directly. Only the SECURITY DEFINER functions of part 2 do.

do $precondition$
begin
  if not exists (select 1 from app_private.football_providers where name = 'sofascore')
    or not exists (select 1 from app_private.football_providers where name = 'flashscore') then
    raise exception 'football_player_mapping: register the sofascore and flashscore providers first (migration 20261001150000)';
  end if;
  if to_regclass('app_private.football_provider_mappings') is null
    or to_regclass('app_private.admin_audit_events') is null
    or to_regclass('app_private.staff_principals') is null then
    raise exception 'football_player_mapping: the mapping table or the admin tables are missing';
  end if;
end
$precondition$;

-- A jsonb document that carries a key that looks like a name is refused.
-- (Fails closed: a harmless key containing "name" is refused too.)
create function app_private.football_mapping_json_has_name_key(p_document jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_document is not null
    and p_document::text ~* '"[a-z0-9_]*name[a-z0-9_]*"[[:space:]]*:';
$$;

-- ---------------------------------------------------------------------------
-- Candidates: one row per provider identity
-- ---------------------------------------------------------------------------
create table app_private.football_player_mapping_candidates (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  external_id text not null,
  status text not null default 'unmapped',
  status_changed_at timestamptz not null default statement_timestamp(),
  -- The mapping row that already holds this provider id (active or not).
  -- Plain uuid on purpose: no foreign key to the mapping table.
  existing_mapping_id uuid,
  -- For a reviewer to read. Never read by any code that decides anything.
  display_name text,
  display_name_purged_at timestamptz,
  -- Set by the builder from reconciled matches: the id appeared in a Botola
  -- lineup or incident, so it can never be classified "not a Botola player".
  lineup_or_incident_seen boolean not null default false,
  -- Bumped whenever the observations change what a reviewer was shown.
  evidence_revision integer not null default 1,
  first_observed_at timestamptz not null default statement_timestamp(),
  last_observed_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint football_player_mapping_candidates_identity_key
    unique (provider_name, external_id),
  constraint football_player_mapping_candidates_provider_check
    check (provider_name in ('sofascore', 'flashscore')),
  constraint football_player_mapping_candidates_external_id_check
    check (external_id = btrim(external_id) and char_length(external_id) between 1 and 200),
  constraint football_player_mapping_candidates_status_check
    check (status in ('unmapped', 'proposed', 'mapped', 'ignored')),
  constraint football_player_mapping_candidates_name_check
    check (display_name is null or (display_name = btrim(display_name) and char_length(display_name) between 1 and 200)),
  constraint football_player_mapping_candidates_purge_check
    check (display_name_purged_at is null or display_name is null),
  constraint football_player_mapping_candidates_revision_check
    check (evidence_revision >= 1)
);
create index football_player_mapping_candidates_status_idx
  on app_private.football_player_mapping_candidates (status, provider_name, id);
create index football_player_mapping_candidates_purge_idx
  on app_private.football_player_mapping_candidates (status_changed_at)
  where status in ('mapped', 'ignored') and display_name is not null;

-- ---------------------------------------------------------------------------
-- Observations: each squad/team context a candidate was seen in
-- ---------------------------------------------------------------------------
create table app_private.football_player_mapping_observations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null
    references app_private.football_player_mapping_candidates(id) on delete restrict,
  -- The requested squad: the provider's own team id for the request.
  provider_team_id text not null,
  club_key text,
  -- The app team, when the builder could resolve it. A signal, never a filter.
  app_team_id uuid references app.teams(id) on delete restrict,
  squad_completeness text not null,
  registered_team_id text,
  registered_team_disagreement boolean not null default false,
  shirt_number smallint,
  position_signal text,
  dob_state text not null,
  -- Only for a valid date; the sanitized evidence never carries it.
  provider_birth_date date,
  dob_january1 boolean not null default false,
  height_cm smallint,
  nationality_signal text,
  observed_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint football_player_mapping_observations_context_key
    unique (candidate_id, provider_team_id),
  constraint football_player_mapping_observations_team_check
    check (provider_team_id = btrim(provider_team_id) and char_length(provider_team_id) between 1 and 100),
  constraint football_player_mapping_observations_club_check
    check (club_key is null or club_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint football_player_mapping_observations_completeness_check
    check (squad_completeness in ('COMPLETE', 'INCOMPLETE_PROVIDER_SQUAD')),
  constraint football_player_mapping_observations_shirt_check
    check (shirt_number is null or shirt_number between 0 and 99),
  constraint football_player_mapping_observations_position_check
    check (position_signal is null or position_signal in ('G', 'D', 'M', 'F')),
  constraint football_player_mapping_observations_dob_state_check
    check (dob_state in ('valid', 'missing', 'not_provided', 'unparseable', 'future',
      'age_below_minimum', 'age_above_maximum')),
  constraint football_player_mapping_observations_dob_value_check
    check ((dob_state = 'valid') = (provider_birth_date is not null)),
  constraint football_player_mapping_observations_jan1_check
    check (not dob_january1 or dob_state = 'valid'),
  constraint football_player_mapping_observations_height_check
    check (height_cm is null or height_cm between 120 and 230),
  constraint football_player_mapping_observations_nationality_check
    check (nationality_signal is null or nationality_signal ~ '^(alpha2:[A-Z]{2}|flag:[0-9]{1,6})$')
);
create index football_player_mapping_observations_team_idx
  on app_private.football_player_mapping_observations (app_team_id)
  where app_team_id is not null;

-- ---------------------------------------------------------------------------
-- Proposals: a decision waiting for (or past) a second person
-- ---------------------------------------------------------------------------
create table app_private.football_player_mapping_proposals (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  kind text not null,
  status text not null default 'pending',
  -- The candidate(s) the decision is about. `map` may carry one per provider;
  -- ignore and reverse_ignore carry exactly one; replace, deactivate and
  -- reactivate carry none (they name the mapping row).
  sofascore_candidate_id uuid
    references app_private.football_player_mapping_candidates(id) on delete restrict,
  flashscore_candidate_id uuid
    references app_private.football_player_mapping_candidates(id) on delete restrict,
  sofascore_external_id text,
  flashscore_external_id text,
  -- replace / deactivate / reactivate: the one mapping row this changes
  -- (no foreign key, see the header) and its provider.
  provider_name text,
  mapping_id uuid,
  -- map: the app player. replace / reactivate: the new values, null if unchanged.
  app_player_id uuid references app.players(id) on delete restrict,
  new_external_id text,
  new_app_player_id uuid references app.players(id) on delete restrict,
  expected_before jsonb,
  basis text not null default 'manual',
  evidence jsonb not null default '{}'::jsonb,
  signals jsonb not null default '{}'::jsonb,
  candidate_revisions jsonb not null default '{}'::jsonb,
  position_disagreement boolean not null default false,
  position_note text,
  position_disagreement_acknowledged boolean not null default false,
  reason text not null,
  requested_by uuid not null references app_private.staff_principals(id) on delete restrict,
  requested_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp() + interval '72 hours',
  decided_by uuid references app_private.staff_principals(id) on delete restrict,
  decided_at timestamptz,
  decision_reason text,
  fingerprint text not null,
  -- Written once at execution.
  executed_by uuid references app_private.staff_principals(id) on delete restrict,
  executed_at timestamptz,
  executed_before jsonb,
  executed_after jsonb,
  execution_idempotency_key uuid,
  -- The latest refusal a trusted function recorded (stable code), if any.
  hold_code text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint football_player_mapping_proposals_kind_check
    check (kind in ('map', 'replace', 'deactivate', 'reactivate', 'ignore', 'reverse_ignore')),
  constraint football_player_mapping_proposals_status_check
    check (status in ('pending', 'approved', 'executed', 'rejected', 'expired', 'cancelled',
      'stale_evidence', 'identity_conflict', 'position_disagreement', 'already_mapped')),
  constraint football_player_mapping_proposals_basis_check
    check (basis in ('incident', 'shirt_position', 'manual')),
  constraint football_player_mapping_proposals_provider_check
    check (provider_name is null or provider_name in ('sofascore', 'flashscore')),
  constraint football_player_mapping_proposals_shape_check check (
    case kind
      when 'map' then
        app_player_id is not null
        and (sofascore_candidate_id is not null or flashscore_candidate_id is not null)
        and (sofascore_candidate_id is not null) = (sofascore_external_id is not null)
        and (flashscore_candidate_id is not null) = (flashscore_external_id is not null)
        and mapping_id is null and new_external_id is null and new_app_player_id is null
      when 'replace' then
        mapping_id is not null and provider_name is not null
        and (new_external_id is not null or new_app_player_id is not null)
        and app_player_id is null
        and sofascore_candidate_id is null and flashscore_candidate_id is null
      when 'reactivate' then
        mapping_id is not null and provider_name is not null
        and app_player_id is null
        and sofascore_candidate_id is null and flashscore_candidate_id is null
      when 'deactivate' then
        mapping_id is not null and provider_name is not null
        and app_player_id is null and new_external_id is null and new_app_player_id is null
        and sofascore_candidate_id is null and flashscore_candidate_id is null
      else -- ignore, reverse_ignore: exactly one candidate
        (sofascore_candidate_id is not null) <> (flashscore_candidate_id is not null)
        and mapping_id is null and app_player_id is null
        and new_external_id is null and new_app_player_id is null
    end
  ),
  constraint football_player_mapping_proposals_reason_check
    check (reason = btrim(reason) and char_length(reason) between 10 and 500),
  constraint football_player_mapping_proposals_decision_reason_check
    check (decision_reason is null
      or (decision_reason = btrim(decision_reason) and char_length(decision_reason) between 10 and 500)),
  constraint football_player_mapping_proposals_note_check
    check (position_note is null
      or (position_note = btrim(position_note) and char_length(position_note) between 10 and 500)),
  constraint football_player_mapping_proposals_fingerprint_check
    check (fingerprint ~ '^[a-f0-9]{64}$'),
  constraint football_player_mapping_proposals_documents_check check (
    jsonb_typeof(evidence) = 'object' and jsonb_typeof(signals) = 'object'
    and jsonb_typeof(candidate_revisions) = 'object'
    and pg_column_size(evidence) <= 8192 and pg_column_size(signals) <= 8192
    and (expected_before is null or (jsonb_typeof(expected_before) = 'object' and pg_column_size(expected_before) <= 4096))
    and (executed_before is null or pg_column_size(executed_before) <= 4096)
    and (executed_after is null or pg_column_size(executed_after) <= 4096)
  ),
  -- No name is ever part of the evidence a decision rests on or of its fingerprint.
  constraint football_player_mapping_proposals_no_names_check check (
    not app_private.football_mapping_json_has_name_key(evidence)
    and not app_private.football_mapping_json_has_name_key(signals)
    and not app_private.football_mapping_json_has_name_key(expected_before)
    and not app_private.football_mapping_json_has_name_key(executed_before)
    and not app_private.football_mapping_json_has_name_key(executed_after)
  ),
  -- Two different humans, enforced here and not only in the functions.
  constraint football_player_mapping_proposals_two_people_check
    check (decided_by is null or decided_by is distinct from requested_by),
  constraint football_player_mapping_proposals_decision_pair_check
    check ((decided_by is null) = (decided_at is null)
      and (decided_by is null) = (decision_reason is null)),
  constraint football_player_mapping_proposals_executed_check check (
    (status = 'executed') = (executed_at is not null)
    and (executed_at is null) = (executed_by is null)
    and (executed_at is null) = (executed_before is null)
    and (executed_at is null) = (executed_after is null)
    and (executed_at is null) = (execution_idempotency_key is null)
    and (status <> 'executed' or (decided_by is not null and executed_by is not null))
  ),
  constraint football_player_mapping_proposals_expiry_check
    check (expires_at > requested_at)
);
create unique index football_player_mapping_proposals_exec_key
  on app_private.football_player_mapping_proposals (execution_idempotency_key)
  where execution_idempotency_key is not null;
create index football_player_mapping_proposals_status_idx
  on app_private.football_player_mapping_proposals (status, requested_at desc, id);
create index football_player_mapping_proposals_batch_idx
  on app_private.football_player_mapping_proposals (batch_id);
create index football_player_mapping_proposals_requester_idx
  on app_private.football_player_mapping_proposals (requested_by, requested_at desc);
create index football_player_mapping_proposals_decider_idx
  on app_private.football_player_mapping_proposals (decided_by) where decided_by is not null;
create index football_player_mapping_proposals_executor_idx
  on app_private.football_player_mapping_proposals (executed_by) where executed_by is not null;
create index football_player_mapping_proposals_app_player_idx
  on app_private.football_player_mapping_proposals (app_player_id) where app_player_id is not null;
create index football_player_mapping_proposals_new_app_player_idx
  on app_private.football_player_mapping_proposals (new_app_player_id) where new_app_player_id is not null;

-- At most one OPEN proposal per provider identity, per mapping row and per
-- app player: the database refuses a duplicate proposal, whatever the caller.
-- Open = pending, approved, position_disagreement, stale_evidence.
create unique index football_player_mapping_proposals_open_sofascore_key
  on app_private.football_player_mapping_proposals (sofascore_candidate_id)
  where sofascore_candidate_id is not null
    and status in ('pending', 'approved', 'position_disagreement', 'stale_evidence');
create unique index football_player_mapping_proposals_open_flashscore_key
  on app_private.football_player_mapping_proposals (flashscore_candidate_id)
  where flashscore_candidate_id is not null
    and status in ('pending', 'approved', 'position_disagreement', 'stale_evidence');
create unique index football_player_mapping_proposals_open_mapping_key
  on app_private.football_player_mapping_proposals (mapping_id)
  where mapping_id is not null
    and status in ('pending', 'approved', 'position_disagreement', 'stale_evidence');
create unique index football_player_mapping_proposals_open_player_key
  on app_private.football_player_mapping_proposals ((coalesce(app_player_id, new_app_player_id)))
  where coalesce(app_player_id, new_app_player_id) is not null
    and status in ('pending', 'approved', 'position_disagreement', 'stale_evidence');
create unique index football_player_mapping_proposals_open_new_external_key
  on app_private.football_player_mapping_proposals (provider_name, new_external_id)
  where new_external_id is not null
    and status in ('pending', 'approved', 'position_disagreement', 'stale_evidence');

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
create function app_private.football_mapping_forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'football_mapping_rows_are_never_deleted';
end;
$$;

create trigger football_player_mapping_candidates_no_delete
  before delete on app_private.football_player_mapping_candidates
  for each row execute function app_private.football_mapping_forbid_delete();
create trigger football_player_mapping_observations_no_delete
  before delete on app_private.football_player_mapping_observations
  for each row execute function app_private.football_mapping_forbid_delete();
create trigger football_player_mapping_proposals_no_delete
  before delete on app_private.football_player_mapping_proposals
  for each row execute function app_private.football_mapping_forbid_delete();
create trigger football_player_mapping_candidates_no_truncate
  before truncate on app_private.football_player_mapping_candidates
  for each statement execute function app_private.football_mapping_forbid_delete();
create trigger football_player_mapping_observations_no_truncate
  before truncate on app_private.football_player_mapping_observations
  for each statement execute function app_private.football_mapping_forbid_delete();
create trigger football_player_mapping_proposals_no_truncate
  before truncate on app_private.football_player_mapping_proposals
  for each statement execute function app_private.football_mapping_forbid_delete();

-- A candidate's identity never changes.
create function app_private.football_mapping_candidate_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.provider_name is distinct from old.provider_name
    or new.external_id is distinct from old.external_id then
    raise exception using errcode = '42501', message = 'football_mapping_candidate_identity_is_immutable';
  end if;
  if new.status is distinct from old.status then
    new.status_changed_at := statement_timestamp();
  end if;
  return new;
end;
$$;
create trigger football_player_mapping_candidates_guard
  before update on app_private.football_player_mapping_candidates
  for each row execute function app_private.football_mapping_candidate_guard();

create function app_private.football_mapping_observation_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.candidate_id is distinct from old.candidate_id
    or new.provider_team_id is distinct from old.provider_team_id then
    raise exception using errcode = '42501', message = 'football_mapping_observation_context_is_immutable';
  end if;
  return new;
end;
$$;
create trigger football_player_mapping_observations_guard
  before update on app_private.football_player_mapping_observations
  for each row execute function app_private.football_mapping_observation_guard();

-- A proposal is immutable once it is final, its payload never changes except
-- through the evidence refresh (the trusted function sets a transaction-local
-- flag), and its states move only along the allowed edges.
create function app_private.football_mapping_proposal_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
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
$$;
create trigger football_player_mapping_proposals_guard
  before update on app_private.football_player_mapping_proposals
  for each row execute function app_private.football_mapping_proposal_guard();

create trigger football_player_mapping_candidates_set_updated_at
  before update on app_private.football_player_mapping_candidates
  for each row execute function app_private.set_updated_at();
create trigger football_player_mapping_observations_set_updated_at
  before update on app_private.football_player_mapping_observations
  for each row execute function app_private.set_updated_at();
create trigger football_player_mapping_proposals_set_updated_at
  before update on app_private.football_player_mapping_proposals
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access: none. Only the trusted functions of part 2 reach these tables.
-- ---------------------------------------------------------------------------
alter table app_private.football_player_mapping_candidates enable row level security;
alter table app_private.football_player_mapping_candidates force row level security;
alter table app_private.football_player_mapping_observations enable row level security;
alter table app_private.football_player_mapping_observations force row level security;
alter table app_private.football_player_mapping_proposals enable row level security;
alter table app_private.football_player_mapping_proposals force row level security;

revoke all on table
  app_private.football_player_mapping_candidates,
  app_private.football_player_mapping_observations,
  app_private.football_player_mapping_proposals
from public, anon, authenticated, service_role;

revoke all on function
  app_private.football_mapping_json_has_name_key(jsonb),
  app_private.football_mapping_forbid_delete(),
  app_private.football_mapping_candidate_guard(),
  app_private.football_mapping_observation_guard(),
  app_private.football_mapping_proposal_guard()
from public, anon, authenticated, service_role;

comment on table app_private.football_player_mapping_candidates is
  'One row per provider identity (provider_name, external_id). Workflow and evidence only: the mapping table, not this one, says who is mapped. display_name is for reviewers to read and is purged 90 days after the candidate becomes mapped or ignored.';
comment on table app_private.football_player_mapping_observations is
  'Each requested squad/team a candidate was seen in. A second observation under another club is not a second candidate and is never negative evidence.';
comment on table app_private.football_player_mapping_proposals is
  'A durable mapping decision that needs a second, different human. Immutable once final; never deleted; history of the mapping row lives here and in app_private.admin_audit_events.';
