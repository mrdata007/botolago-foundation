begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- The controlled bulk-mapping batch against the REAL database functions, on a
-- synthetic, production-shaped world (1,004 unmapped candidates, 465 of them
-- Flashscore, 189 eligible: 108 Tier A and 81 Tier B). No migration is involved:
-- the batch reuses propose (max 100 per call), approve and execute, one proposal
-- at a time. Sections are numbered in the comments.

create temporary table stash (k text primary key, v text);
create function pg_temp.put(p_key text, p_value text) returns void language sql as
  $$ insert into stash values (p_key, p_value) on conflict (k) do update set v = excluded.v $$;
create function pg_temp.get(p_key text) returns text language sql as
  $$ select v from stash where k = p_key $$;

-- The single operator: one football operator on a fresh aal2 session, with the
-- single-approver switch ON (the owner's current production mode).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e1000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'bulk-a1@example.test', 'hash', now(), '{}', '{"username":"bulk_a1"}', now(), now());
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('e3000000-0000-4000-8000-0000000000a1', 'e1000000-0000-4000-8000-0000000000a1', 'TOTP', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at)
values ('e2000000-0000-4000-8000-0000000000a1', 'e1000000-0000-4000-8000-0000000000a1', now());
insert into app_private.staff_principals (auth_user_id) values ('e1000000-0000-4000-8000-0000000000a1');
insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select sp.id, r.id, 'Test operator for the bulk batch.'
from app_private.staff_principals sp, app_private.admin_roles r
where sp.auth_user_id = 'e1000000-0000-4000-8000-0000000000a1' and r.name = 'football_operator';

create function pg_temp.act(p_who text) returns void language plpgsql as $$
begin
  if p_who = 'svc' then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  else
    perform set_config('request.jwt.claims',
      '{"sub":"e1000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal2","session_id":"e2000000-0000-4000-8000-0000000000a1"}', true);
  end if;
end;
$$;

update app_private.football_mapping_settings set allow_self_approval = true;

-- ===========================================================================
-- 0. The synthetic production-shaped world
-- ===========================================================================
insert into app.teams (id, slug, name, short_name)
select ('e4000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'bulk-club-' || g, 'Bulk Club ' || g, 'B' || g
from generate_series(1, 15) g;

-- One row per synthetic Sofascore player: kind decides which part of the contract it meets.
create temporary table world (
  i integer primary key, kind text not null, club integer not null, pos text not null, dob date not null,
  shirt integer not null, app_shirt integer, has_sm boolean not null, app_dob date);
insert into world
select i, kind, 1 + (i % 15), (array['G','D','M','F'])[1 + (i % 4)],
  (date '1990-02-02' + (i * 3)),            -- distinct per player, never a January 1
  1 + (i % 98),
  case when kind = 'B' then null else 1 + (i % 98) end,
  kind <> 'noSM',
  case when kind = 'janApp' then date '1992-01-01' else (date '1990-02-02' + (i * 3)) end
from (
  select (row_number() over ())::int as i, kind from (
    select 'A' as kind from generate_series(1, 108)
    union all select 'B' from generate_series(1, 81)
    union all select 'noDob' from generate_series(1, 316)
    union all select 'posConf' from generate_series(1, 10)
    union all select 'janProv' from generate_series(1, 5)
    union all select 'janApp' from generate_series(1, 5)
    union all select 'incomplete' from generate_series(1, 5)
    union all select 'multi' from generate_series(1, 2)
    union all select 'shirtConf' from generate_series(1, 3)
    union all select 'noSM' from generate_series(1, 4)) k) numbered;
-- Dates must never be a January 1 (so the placeholder tests mean something).
update world set dob = dob + 1 where extract(month from dob) = 1 and extract(day from dob) = 1 and kind <> 'janApp';
update world set app_dob = dob where kind <> 'janApp';

insert into app.players (id, slug, full_name, display_name, position)
select ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'bulk-player-' || i,
  'Real Name ' || i, 'Display Name ' || i,
  (case pos when 'G' then 'goalkeeper' when 'D' then 'defender' when 'M' then 'midfielder' else 'forward' end)::app.football_position
from world;
insert into app.team_memberships (player_id, team_id, valid_from, shirt_number)
select ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('e4000000-0000-4000-8000-' || lpad(club::text, 12, '0'))::uuid, date '2026-07-01', app_shirt
from world;
-- App birth dates only enter through the attribute resolver.
select app_private.record_player_attribute_observation(
  ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'date_of_birth', app_dob::text, null,
  'provider', 'sportsmonks', 'bulk-test', '2026-09-01T00:00:00Z')
from world;
select app_private.resolve_player_attributes(array(
  select ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from world));

-- The SportsMonks identity: an active mapping on the same canonical player.
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
select 'sportsmonks', 'player', 'SM-' || i, ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'test', now()
from world where has_sm;

-- Observations, as the read-only collector reports them. NO NAME is an input of any contract rule.
select pg_temp.act('svc');
select api.football_mapping_record_observations(jsonb_agg(jsonb_build_object(
  'provider', 'sofascore', 'externalPlayerId', 'S' || i, 'providerTeamId', 'PT' || club,
  'clubKey', 'bulk-club-' || club, 'appTeamId', ('e4000000-0000-4000-8000-' || lpad(club::text, 12, '0')),
  'squadCompleteness', case when kind = 'incomplete' then 'INCOMPLETE_PROVIDER_SQUAD' else 'COMPLETE' end,
  'registeredTeamDisagreement', false,
  'shirtNumber', case when kind = 'shirtConf' then shirt + 1 else shirt end,
  'positionSignal', case when kind = 'posConf' then (array['D','M','F','G'])[1 + (i % 4)] else pos end,
  'dobState', 'valid',
  'birthDate', (case when kind = 'noDob' then date '1980-03-03' + i when kind = 'janProv' then date '1995-01-01'
                     when kind = 'janApp' then date '1992-01-01' else dob end)::text,
  'dobJanuary1', kind = 'janProv',
  'displayName', 'Provider Name ' || i)))
from world;
-- A second squad for the multi-squad candidates.
select api.football_mapping_record_observations(jsonb_agg(jsonb_build_object(
  'provider', 'sofascore', 'externalPlayerId', 'S' || i, 'providerTeamId', 'PT' || club || 'b',
  'clubKey', 'bulk-club-' || club, 'appTeamId', ('e4000000-0000-4000-8000-' || lpad(((club % 15) + 1)::text, 12, '0')),
  'squadCompleteness', 'COMPLETE', 'registeredTeamDisagreement', false, 'shirtNumber', shirt,
  'positionSignal', pos, 'dobState', 'valid', 'birthDate', dob::text, 'dobJanuary1', false,
  'displayName', 'Provider Name ' || i)))
from world where kind = 'multi';
-- 465 Flashscore candidates: no birth date, no bridge.
select api.football_mapping_record_observations(jsonb_agg(jsonb_build_object(
  'provider', 'flashscore', 'externalPlayerId', 'F' || g, 'providerTeamId', 'FT' || (1 + g % 15),
  'clubKey', 'bulk-club-' || (1 + g % 15), 'appTeamId', ('e4000000-0000-4000-8000-' || lpad((1 + g % 15)::text, 12, '0')),
  'squadCompleteness', 'COMPLETE', 'registeredTeamDisagreement', false, 'shirtNumber', 1 + (g % 98),
  'positionSignal', (array['G','D','M','F'])[1 + (g % 4)], 'dobState', 'missing', 'displayName', 'Flash Name ' || g)))
from generate_series(1, 465) g;

-- Two identities already mapped by hand, like the real Tagnaouti and Babacar mappings.
insert into app.players (id, slug, full_name, display_name, position)
values ('a2000000-0000-4000-8000-000000000001', 'bulk-pre-1', 'Pre One', 'Pre One', 'goalkeeper'),
       ('a2000000-0000-4000-8000-000000000002', 'bulk-pre-2', 'Pre Two', 'Pre Two', 'goalkeeper'),
       ('a2000000-0000-4000-8000-000000000003', 'bulk-pre-3', 'Pre Three', 'Pre Three', 'goalkeeper');
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at,
  manually_corrected, correction_reason, corrected_by, corrected_at)
values ('sofascore', 'player', 'PRE-1', 'a2000000-0000-4000-8000-000000000001', 'test', now(), true, 'Reviewed earlier.', 'e1000000-0000-4000-8000-0000000000a1', now()),
       ('sofascore', 'player', 'PRE-2', 'a2000000-0000-4000-8000-000000000002', 'test', now(), true, 'Reviewed earlier.', 'e1000000-0000-4000-8000-0000000000a1', now());

select extensions.is((select count(*)::int from app_private.football_player_mapping_candidates), 1004,
  '0.1 the world has 1,004 candidates');
select extensions.is((select count(*)::int from app_private.football_player_mapping_candidates where provider_name = 'flashscore'), 465,
  '0.2 465 of them are Flashscore');

-- Baselines for the invariance checks at the end.
create function pg_temp.world_parts() returns jsonb language sql as $$
  select jsonb_build_object(
    'players', (select md5(string_agg(p::text, ',' order by p.id)) from app.players p),
    'memberships', (select md5(string_agg(m::text, ',' order by m.id)) from app.team_memberships m),
    'cron', (select md5(string_agg(j::text, ',' order by j.jobid)) from cron.job j),
    'automation', (select md5(coalesce(string_agg(t::text, ','), '')) from app_private.fantasy_automation_settings t),
    'fantasy', jsonb_build_array((select count(*) from app.fantasy_players), (select count(*) from app.fantasy_player_gameweek_points),
      (select count(*) from app.fantasy_player_point_events), (select count(*) from app.fantasy_gameweeks),
      (select count(*) from app_private.fantasy_scoring_snapshots)))
$$;
create function pg_temp.world_digest() returns text language sql as $$ select md5(pg_temp.world_parts()::text) $$;
select pg_temp.put('pre_digest', (select md5(string_agg(m::text, ',' order by m.id))
  from app_private.football_provider_mappings m where m.external_id in ('PRE-1', 'PRE-2')));
select pg_temp.put('mappings_before', (select count(*)::text from app_private.football_provider_mappings));
select pg_temp.put('other_mappings_digest', (select md5(string_agg(m::text, ',' order by m.id))
  from app_private.football_provider_mappings m));

-- ===========================================================================
-- 1. The eligibility contract and the manifest (read-only, name-free)
-- ===========================================================================
create function pg_temp.manifest() returns jsonb language sql as $manifest$
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
    from sealed s), '[]'::jsonb)) as manifest_rows
$manifest$;

select pg_temp.put('m1', pg_temp.manifest()::text);
select extensions.is((pg_temp.get('m1')::jsonb -> 'summary' ->> 'evaluated')::int, 1004, '1.1 the contract evaluates every unmapped candidate');
select extensions.is((pg_temp.get('m1')::jsonb -> 'summary' ->> 'eligible')::int, 189, '1.2 exactly 189 are eligible');
select extensions.is((pg_temp.get('m1')::jsonb -> 'summary' ->> 'tierA')::int, 108, '1.3 108 are Tier A');
select extensions.is((pg_temp.get('m1')::jsonb -> 'summary' ->> 'tierB')::int, 81, '1.4 81 are Tier B');
select extensions.is((pg_temp.get('m1')::jsonb -> 'summary' ->> 'rowsRemovedByCollisionGate')::int, 0, '1.5 the collision gate removes nothing here');
select extensions.is((pg_temp.get('m1')::jsonb -> 'summary' -> 'buckets' ->> 'flashscore|INSUFFICIENT_EVIDENCE')::int, 465,
  '1.6 every Flashscore candidate is insufficient evidence (no independent bridge)');
select extensions.ok(not exists (
  select 1 from jsonb_array_elements(pg_temp.get('m1')::jsonb -> 'rows') r
  where (r ->> 'externalId') not in (select 'S' || i from world where kind in ('A', 'B'))),
  '1.7 only Tier A / Tier B synthetic players are in the manifest: no January-1, incomplete, multi-squad, conflict, no-SportsMonks or no-date row');
select extensions.is((select count(*)::int from jsonb_array_elements(pg_temp.get('m1')::jsonb -> 'rows') r
  where r ->> 'tier' = 'A' and r ->> 'shirt' = 'match'), 108, '1.8 Tier A is exactly the shirt matches');
select extensions.is((select count(*)::int from jsonb_array_elements(pg_temp.get('m1')::jsonb -> 'rows') r
  where r ->> 'tier' = 'B' and r ->> 'shirt' = 'no_signal'), 81, '1.9 Tier B is exactly the no-signal shirts, never a conflict');
select extensions.ok(pg_temp.get('m1') !~ '[0-9]{4}-[0-9]{2}-[0-9]{2}', '1.10 no birth date leaves the database');
select extensions.ok(pg_temp.get('m1') !~* '(Real Name|Display Name|Provider Name|Flash Name)', '1.11 no name leaves the database');

-- NAMES NEGATIVE CONTROL: rename everybody; nothing that decides moves.
update app.players set full_name = 'ZZ ' || reverse(full_name), display_name = 'QQ ' || reverse(display_name);
update app_private.football_player_mapping_candidates set display_name = 'XX ' || reverse(coalesce(display_name, 'n'));
select extensions.is(pg_temp.manifest()::text, pg_temp.get('m1'),
  '1.12 renaming every provider and app player changes NOTHING: same eligibility, targets, tiers and fingerprints');
-- The invariance baseline for the batch itself starts here (after the rename).
select pg_temp.put('world_digest', pg_temp.world_digest());
select pg_temp.put('world_parts', pg_temp.world_parts()::text);

-- ===========================================================================
-- 2. PROPOSE: bounded batches, one proposal per row, nothing mapped
-- ===========================================================================
create function pg_temp.items(p_tier text, p_from integer, p_count integer) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', cid, 'appPlayerId', app, 'basis', 'manual') order by cid), '[]'::jsonb)
  from (
    select (r ->> 'candidateId') as cid, (r ->> 'appPlayerId') as app
    from jsonb_array_elements(pg_temp.get('m1')::jsonb -> 'rows') r
    where r ->> 'tier' = p_tier order by r ->> 'candidateId' offset p_from limit p_count) s
$$;
create function pg_temp.reason(p_tier text) returns text language sql as $$
  select (pg_temp.get('m1')::jsonb -> 'rows' -> (select min(ord - 1)::int from jsonb_array_elements(pg_temp.get('m1')::jsonb -> 'rows') with ordinality t(r, ord) where r ->> 'tier' = p_tier) ->> 'reason')
$$;

select pg_temp.act('a');
select extensions.throws_ok(
  format($f$select api.admin_football_mapping_propose(%L::jsonb, %L, gen_random_uuid())$f$,
    (select jsonb_agg(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', gen_random_uuid(), 'appPlayerId', gen_random_uuid())) from generate_series(1, 101)),
    'Batch-reviewed structured identity: too many in one call.'),
  'PT400', 'invalid_proposal', '2.1 the backend limit of 100 per call is not weakened');

-- A call of 40 is refused by the 8 KB ceiling on a stored response (admin_idempotency_keys), long
-- before the 100-item limit: the whole call rolls back and creates nothing. So the batch proposes in
-- bounded calls of 25 (a 25-item response is about 6 KB).
select extensions.throws_ok(
  format($f$select api.admin_football_mapping_propose(%L::jsonb, %L, gen_random_uuid())$f$, pg_temp.items('A', 0, 40), pg_temp.reason('A')),
  '23514', null, '2.1b a call whose stored response would exceed 8 KB is refused whole, never half-applied');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals), 0, '2.1c and it created no proposal');

create temporary table propose_calls (tier text, offs integer, ok_count integer);
create function pg_temp.propose_tier(p_tier text, p_total integer) returns void language plpgsql as $$
declare o integer := 0; v jsonb;
begin
  perform pg_temp.act('a');
  while o < p_total loop
    v := api.admin_football_mapping_propose(pg_temp.items(p_tier, o, 25), pg_temp.reason(p_tier), gen_random_uuid());
    insert into propose_calls values (p_tier, o, (select count(*)::int from jsonb_array_elements(v -> 'proposals') p where (p ->> 'ok')::boolean));
    o := o + 25;
  end loop;
end;
$$;
select pg_temp.propose_tier('A', 108);
select pg_temp.propose_tier('B', 81);
select extensions.is((select count(*)::int from propose_calls where tier = 'A'), 5, '2.2 Tier A takes 5 bounded calls (4 x 25 + 8)');
select extensions.is((select sum(ok_count)::int from propose_calls where tier = 'A'), 108, '2.3 and creates 108 proposals');
select extensions.is((select count(*)::int from propose_calls where tier = 'B'), 4, '2.4 Tier B takes 4 bounded calls (3 x 25 + 6)');
select extensions.is((select sum(ok_count)::int from propose_calls where tier = 'B'), 81, '2.4b and creates 81 proposals');
select extensions.ok((select max(ok_count) from propose_calls) <= 25, '2.4c no call carries more than 25 items');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where status = 'pending'), 189, '2.5 189 individual pending proposals');
select extensions.is((select count(distinct id)::int from app_private.football_player_mapping_proposals), 189, '2.6 each has its own id');
select extensions.is((select count(distinct fingerprint)::int from app_private.football_player_mapping_proposals), 189, '2.7 each has its own fingerprint');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals p
  join jsonb_array_elements(pg_temp.get('m1')::jsonb -> 'rows') r on r ->> 'candidateId' = p.sofascore_candidate_id::text
  where p.fingerprint = r ->> 'expectedFingerprint'), 189,
  '2.8 EVERY proposal fingerprint equals the one frozen in the manifest');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals p
  join jsonb_array_elements(pg_temp.get('m1')::jsonb -> 'rows') r on r ->> 'candidateId' = p.sofascore_candidate_id::text
  where p.reason = r ->> 'reason' and p.app_player_id = (r ->> 'appPlayerId')::uuid and p.expires_at > now()), 189,
  '2.9 each carries its own tier reason, its own target and its own expiry');
select extensions.is((select count(*)::int from app_private.admin_audit_events where action = 'football.mapping_proposed'), 189, '2.10 one audit event per proposal');
select extensions.is((select count(*)::int from app_private.football_provider_mappings)::text, pg_temp.get('mappings_before'), '2.11 PROPOSE maps nothing');

-- ===========================================================================
-- 3. Stale evidence between PROPOSE and APPROVE; APPROVE one proposal at a time
-- ===========================================================================
-- The provider's shirt number moves for one candidate: its evidence revision bumps.
select pg_temp.put('stale_cid', (select r ->> 'candidateId' from jsonb_array_elements(pg_temp.get('m1')::jsonb -> 'rows') r where r ->> 'tier' = 'A' order by r ->> 'candidateId' limit 1));
select pg_temp.act('svc');
select api.football_mapping_record_observations(jsonb_build_array(jsonb_build_object(
  'provider', 'sofascore', 'externalPlayerId', (select external_id from app_private.football_player_mapping_candidates where id = pg_temp.get('stale_cid')::uuid),
  'providerTeamId', (select provider_team_id from app_private.football_player_mapping_observations where candidate_id = pg_temp.get('stale_cid')::uuid),
  'clubKey', (select club_key from app_private.football_player_mapping_observations where candidate_id = pg_temp.get('stale_cid')::uuid),
  'appTeamId', (select app_team_id from app_private.football_player_mapping_observations where candidate_id = pg_temp.get('stale_cid')::uuid),
  'squadCompleteness', 'COMPLETE', 'registeredTeamDisagreement', false, 'shirtNumber', 99, 'positionSignal',
  (select position_signal from app_private.football_player_mapping_observations where candidate_id = pg_temp.get('stale_cid')::uuid),
  'dobState', 'valid', 'birthDate', (select provider_birth_date::text from app_private.football_player_mapping_observations where candidate_id = pg_temp.get('stale_cid')::uuid))));

create temporary table decide_log (proposal_id uuid primary key, outcome jsonb, error text);
create function pg_temp.approve_all() returns void language plpgsql as $$
declare p record; v_res jsonb;
begin
  perform pg_temp.act('a');
  for p in select id, fingerprint from app_private.football_player_mapping_proposals where status = 'pending' order by id loop
    begin
      v_res := api.admin_football_mapping_decide(p.id, 'approve',
        'Reviewed the frozen batch evidence and confirmed the proposal still matches the approved structured identity manifest.',
        p.fingerprint, false, gen_random_uuid());
      insert into decide_log values (p.id, v_res, null);
    exception when others then
      insert into decide_log values (p.id, null, sqlerrm);
    end;
  end loop;
end;
$$;
select pg_temp.approve_all();
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where status = 'approved'), 188,
  '3.1 188 proposals are approved: the stale one does not stop the others');
select extensions.is((select status from app_private.football_player_mapping_proposals where sofascore_candidate_id = pg_temp.get('stale_cid')::uuid), 'stale_evidence',
  '3.2 the stale row is held as stale_evidence, never silently retargeted');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where status = 'approved' and self_approved), 188,
  '3.3 every approval is recorded as a self-approval (single-operator mode)');
select extensions.is((select count(distinct decision_reason)::int from app_private.football_player_mapping_proposals where status = 'approved'), 1,
  '3.4 each carries the factual approval reason');
select extensions.is((select count(*)::int from app_private.admin_audit_events where action = 'football.mapping_approved'), 188, '3.5 one approval audit event per approval');
select extensions.is((select count(*)::int from app_private.football_provider_mappings)::text, pg_temp.get('mappings_before'), '3.6 APPROVE maps nothing');

-- ===========================================================================
-- 4. EXECUTE one at a time; the world moves mid-run; one bad row never corrupts the rest
-- ===========================================================================
-- A target taken by someone else, a provider id taken, and an approval older than 24 hours.
select pg_temp.put('target_taken', (select app_player_id::text from app_private.football_player_mapping_proposals where status = 'approved' order by id offset 5 limit 1));
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
values ('sofascore', 'player', 'SOMEONE-ELSE', pg_temp.get('target_taken')::uuid, 'test', now());
select pg_temp.put('ext_taken', (select sofascore_external_id from app_private.football_player_mapping_proposals where status = 'approved' order by id offset 9 limit 1));
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
values ('sofascore', 'player', pg_temp.get('ext_taken'), 'a2000000-0000-4000-8000-000000000003'::uuid, 'test', now());
alter table app_private.football_player_mapping_proposals disable trigger football_player_mapping_proposals_guard;
select pg_temp.put('old_pid', (select id::text from app_private.football_player_mapping_proposals where status = 'approved' order by id offset 13 limit 1));
update app_private.football_player_mapping_proposals set decided_at = now() - interval '25 hours' where id = pg_temp.get('old_pid')::uuid;
alter table app_private.football_player_mapping_proposals enable trigger football_player_mapping_proposals_guard;

create temporary table execute_log (proposal_id uuid primary key, outcome jsonb, error text);
create function pg_temp.execute_all() returns void language plpgsql as $$
declare p record; v_res jsonb;
begin
  perform pg_temp.act('a');
  for p in select id from app_private.football_player_mapping_proposals where status = 'approved' order by id loop
    begin
      v_res := api.admin_football_mapping_execute(p.id, gen_random_uuid());
      insert into execute_log values (p.id, v_res, null);
    exception when others then
      insert into execute_log values (p.id, null, sqlerrm);
    end;
  end loop;
end;
$$;
select pg_temp.execute_all();
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where status = 'executed'), 185,
  '4.1 185 execute: the three bad rows (target taken, provider id taken, approval too old) never stop or undo the others');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where source_version like 'football_player_mapping:%'), 185,
  '4.2 exactly 185 new reviewed mapping rows exist, each from its own proposal');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where status = 'approved'), 1,
  '4.3 the expired approval stays approved, untouched, never retried');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where status = 'already_mapped'), 2,
  '4.3b the two claimed rows are remembered as already_mapped, never retargeted or retried');
select extensions.ok(exists (select 1 from execute_log where error ilike '%approval_expired%' or outcome ->> 'code' = 'approval_expired'), '4.4 the old approval is refused as expired');
select extensions.ok((select count(*) from execute_log where (outcome ->> 'code') = 'already_mapped' or error ilike '%already_mapped%') = 2, '4.5 both claimed rows are refused as already_mapped');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name = 'sofascore' and external_id in
  (select sofascore_external_id from app_private.football_player_mapping_proposals where status in ('approved', 'already_mapped'))
  and source_version like 'football_player_mapping:%'), 0, '4.6 the refused rows have no mapping of their own');
select extensions.is((select count(*)::int from app_private.football_player_mapping_candidates where status = 'mapped' and provider_name = 'sofascore'), 186,
  '4.7 185 executed + the one candidate whose provider id someone else claimed are mapped; nobody else');
select extensions.is((select count(*)::int from app_private.admin_audit_events where action = 'football.mapping_executed'), 185, '4.8 one execution audit event per mapping');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name = 'flashscore'), 0, '4.9 no Flashscore mapping was created');
select extensions.is((select count(*)::int from app_private.football_player_mapping_candidates where provider_name = 'flashscore' and status <> 'unmapped'), 0, '4.10 no Flashscore candidate was touched');

-- ===========================================================================
-- 5. Resumability: replaying a call with its own idempotency key repeats nothing
-- ===========================================================================
select pg_temp.act('a');
select pg_temp.put('rk', gen_random_uuid()::text);
select pg_temp.put('rp', (select id::text from app_private.football_player_mapping_proposals where status = 'executed' order by id limit 1));
select extensions.throws_ok(
  format($f$select api.admin_football_mapping_execute(%L::uuid, gen_random_uuid())$f$, pg_temp.get('rp')),
  'PT409', 'operation_already_executed', '5.1 a proposal executes once: pressing EXECUTE again is refused');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where source_version like 'football_player_mapping:%'), 185,
  '5.2 and no second mapping row appears');

-- ===========================================================================
-- 6. Invariance
-- ===========================================================================
select extensions.is((select coalesce(jsonb_object_agg(k, 'changed'), '{}'::jsonb)::text from jsonb_each(pg_temp.world_parts()) e(k, v) where v is distinct from (pg_temp.get('world_parts')::jsonb -> k)), '{}',
  '6.0 (which part, if any, moved)');
select extensions.is(pg_temp.world_digest(), pg_temp.get('world_digest'),
  '6.1 app players, team memberships, Fantasy tables, scoring snapshots, automation settings and cron jobs are byte-for-byte unchanged');
select extensions.is((select md5(string_agg(m::text, ',' order by m.id)) from app_private.football_provider_mappings m where m.external_id in ('PRE-1', 'PRE-2')),
  pg_temp.get('pre_digest'), '6.2 the two earlier reviewed mappings are untouched');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where external_id like 'SM-%'), (select count(*)::int from world where has_sm),
  '6.3 every SportsMonks mapping is untouched');
select extensions.is((select count(*)::int from app_private.football_player_mapping_observations), 1004 + 2 + 0,
  '6.4 observations are unchanged (1,004 candidates + 2 second squads)');

select * from extensions.finish();
rollback;
