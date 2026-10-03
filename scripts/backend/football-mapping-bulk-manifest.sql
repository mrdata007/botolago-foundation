-- READ ONLY. The eligibility contract of the controlled bulk-mapping batch (owner
-- approval of 2026-10-02), as ONE select, plus the exact proposal fingerprint each
-- eligible row will receive. It writes nothing, takes no lock a reader would not,
-- and never reads a name: no display name, slug or full name appears below, and no
-- raw birth date leaves the database (only the signal state "match").
--
-- Output: one json document {summary, rows}. `scripts/backend/build-bulk-mapping-manifest.ts`
-- turns `rows` into the committed, hashed manifest.
--
-- Frozen contract (do not widen): a Sofascore candidate is eligible only when it is
-- unmapped, its provider id is free and unique, it has ONE squad observation, the
-- squad is COMPLETE, there is no registered-team disagreement, the provider birth
-- date is valid and not January 1, exactly ONE active member of the observed club
-- agrees on the exact birth date (the app date is valid and not January 1: that is
-- what makes the signal "match"), position matches, club matches, there are no
-- flags, the target app player is free for Sofascore, no proposal is open, and an
-- ACTIVE SportsMonks mapping already resolves the same app player. Tier A: shirt
-- matches. Tier B: shirt gives no signal (a shirt CONFLICT is excluded).
with reasons as (
  select 'A'::text as tier,
    'Batch-reviewed structured identity: exact DOB and current club agreement, matching position and shirt number, unique app-player target, and an existing active SportsMonks identity resolving to the same canonical player.'::text as reason
  union all
  select 'B',
    'Batch-reviewed structured identity: exact DOB and current club agreement, matching position, unique app-player target, and an existing active SportsMonks identity resolving to the same canonical player. Shirt number provides no signal and no shirt conflict is present.'
), base as (
  select c.id as cand_id, c.provider_name, c.external_id, c.status, c.existing_mapping_id, c.evidence_revision,
    (select count(*) from app_private.football_player_mapping_observations o where o.candidate_id = c.id) as n_obs,
    exists (select 1 from app_private.football_provider_mappings m
      where m.provider_name = c.provider_name and m.entity_type = 'player' and m.external_id = c.external_id) as ext_mapped,
    exists (select 1 from app_private.football_player_mapping_proposals p
      where p.status not in ('rejected', 'cancelled', 'expired', 'executed')
        and (p.sofascore_candidate_id = c.id or p.flashscore_candidate_id = c.id)) as open_prop
  from app_private.football_player_mapping_candidates c
  -- The two identities already mapped by hand are never reconsidered.
  where c.id not in (
    select id from app_private.football_player_mapping_candidates
    where existing_mapping_id is not null or status = 'mapped')
), o1 as (
  select b.*, o.app_team_id, o.club_key, o.squad_completeness, o.registered_team_disagreement,
    o.dob_state, o.dob_january1, o.shirt_number, o.position_signal
  from base b
  left join app_private.football_player_mapping_observations o on o.candidate_id = b.cand_id and b.n_obs = 1
), opts as (
  select o.cand_id, p.id as app_player_id,
    app_private.football_mapping_candidate_signals(o.cand_id, p.id) as s
  from o1 o
  join app.team_memberships m on m.team_id = o.app_team_id and m.active
    and (m.valid_to is null or m.valid_to >= current_date) and (m.valid_from is null or m.valid_from <= current_date)
  join app.players p on p.id = m.player_id and p.active
  where o.provider_name = 'sofascore' and o.status = 'unmapped' and o.n_obs = 1
    and o.squad_completeness = 'COMPLETE' and not o.registered_team_disagreement
    and o.dob_state = 'valid' and not o.dob_january1 and o.app_team_id is not null
    and not o.ext_mapped and not o.open_prop
), agg as (
  select cand_id, count(*) as n_opts,
    count(*) filter (where s ->> 'dob' = 'match') as dobm,
    (array_agg(app_player_id) filter (where s ->> 'dob' = 'match'))[1] as target,
    (array_agg(s) filter (where s ->> 'dob' = 'match'))[1] as ts
  from opts group by cand_id
), cls as (
  select o.cand_id, o.provider_name, o.external_id, o.evidence_revision, o.app_team_id, a.target, a.ts,
    exists (select 1 from app_private.football_provider_mappings m
      where m.provider_name = 'sportsmonks' and m.entity_type = 'player'
        and m.internal_entity_id = a.target and m.active) as sm_active,
    case
      when o.ext_mapped or o.status = 'mapped' or o.existing_mapping_id is not null then 'ALREADY_MAPPED'
      when o.status <> 'unmapped' or o.open_prop then 'HELD'
      when o.provider_name = 'flashscore' then 'INSUFFICIENT_EVIDENCE'
      when o.n_obs <> 1 then 'AMBIGUOUS'
      when o.app_team_id is null or o.squad_completeness <> 'COMPLETE'
        or o.dob_state <> 'valid' or o.dob_january1 then 'INCOMPLETE_PROVIDER_DATA'
      when o.registered_team_disagreement then 'CONFLICT'
      when a.cand_id is null or a.dobm = 0 then 'INSUFFICIENT_EVIDENCE'
      when a.dobm > 1 then 'AMBIGUOUS'
      when a.ts ->> 'position' = 'conflict' or jsonb_array_length(a.ts -> 'flags') > 0
        or a.ts ->> 'club' <> 'match' or a.ts ->> 'shirt' = 'conflict' then 'CONFLICT'
      when exists (select 1 from app_private.football_provider_mappings m
        where m.provider_name = 'sofascore' and m.entity_type = 'player'
          and m.internal_entity_id = a.target) then 'CONFLICT'
      when a.ts ->> 'position' <> 'match' then 'INSUFFICIENT_EVIDENCE'
      when not exists (select 1 from app_private.football_provider_mappings m
        where m.provider_name = 'sportsmonks' and m.entity_type = 'player'
          and m.internal_entity_id = a.target and m.active) then 'INSUFFICIENT_EVIDENCE'
      else 'ELIGIBLE'
    end as bucket
  from o1 o
  left join agg a on a.cand_id = o.cand_id
), pre as (
  select * from cls where bucket = 'ELIGIBLE'
), dup_target as (
  select target from pre group by target having count(*) > 1
), dup_ext as (
  select external_id from pre group by external_id having count(*) > 1
), final as (
  select p.* from pre p
  where p.target not in (select target from dup_target)
    and p.external_id not in (select external_id from dup_ext)
), rows_out as (
  select f.cand_id, f.external_id, f.target, f.app_team_id, f.evidence_revision, f.ts,
    case when f.ts ->> 'shirt' = 'match' then 'A' else 'B' end as tier
  from final f
  where f.ts ->> 'shirt' in ('match', 'no_signal')
), computed as (
  select r.*, rs.reason,
    app_private.football_mapping_compute('map', r.cand_id, null, null, null, r.target, null, null) as comp
  from rows_out r
  join reasons rs on rs.tier = r.tier
), sealed as (
  select c.*,
    app_private.football_mapping_row_fingerprint(
      jsonb_populate_record(null::app_private.football_player_mapping_proposals, jsonb_build_object(
        'kind', 'map',
        'sofascore_candidate_id', c.cand_id,
        'sofascore_external_id', c.external_id,
        'app_player_id', c.target,
        'basis', 'manual',
        'evidence', (c.comp -> 'evidence') || jsonb_build_object('refs', '[]'::jsonb),
        'signals', c.comp -> 'signals',
        'candidate_revisions', c.comp -> 'candidateRevisions',
        'position_disagreement', (c.comp ->> 'positionDisagreement')::boolean,
        'reason', c.reason))) as fingerprint
  from computed c
)
select jsonb_build_object(
  'summary', jsonb_build_object(
    'evaluated', (select count(*) from cls),
    'buckets', (select jsonb_object_agg(provider_name || '|' || bucket, n)
      from (select provider_name, bucket, count(*) as n from cls group by 1, 2) x),
    'eligibleBeforeCollisionGate', (select count(*) from pre),
    'duplicateTargetGroups', (select count(*) from dup_target),
    'duplicateProviderIdGroups', (select count(*) from dup_ext),
    'rowsRemovedByCollisionGate', (select count(*) from pre) - (select count(*) from final),
    'eligible', (select count(*) from sealed),
    'tierA', (select count(*) from sealed where tier = 'A'),
    'tierB', (select count(*) from sealed where tier = 'B')),
  'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'candidateId', s.cand_id,
      'externalId', s.external_id,
      'appPlayerId', s.target,
      'appTeamId', s.app_team_id,
      'evidenceRevision', s.evidence_revision,
      'tier', s.tier,
      'shirt', s.ts ->> 'shirt',
      'evidence', (s.comp -> 'evidence') || jsonb_build_object('refs', '[]'::jsonb),
      'signals', s.comp -> 'signals',
      'reason', s.reason,
      'expectedFingerprint', s.fingerprint) order by s.cand_id)
    from sealed s), '[]'::jsonb)) as manifest_rows;
