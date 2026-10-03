begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- A Flashscore identity is mapped only while the Sofascore mapping it rests on is still, in the database,
-- exactly what the reviewer saw. These tests run the REAL propose, decide, execute and read functions on a
-- synthetic world. Nothing here uses the client: every case reaches the database the way a direct
-- authenticated call would. Sections:
--   1 world and the Sofascore side   2 the actual-row read    3 propose: required, forged, wrong target
--   4 a valid dependency succeeds    5 execute refuses when the supporting mapping broke
--   6 refresh recovers               7 replace / reactivate / deactivate of Flashscore rows
--   8 Sofascore behaviour unchanged  9 invariance (the completed mappings and their audit untouched)

create temporary table stash (k text primary key, v text);
create function pg_temp.put(p_key text, p_value text) returns void language sql as
  $$ insert into stash values (p_key, p_value) on conflict (k) do update set v = excluded.v $$;
create function pg_temp.get(p_key text) returns text language sql as
  $$ select v from stash where k = p_key $$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e1000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'dep-c1@example.test', 'hash', now(), '{}', '{"username":"dep_c1"}', now(), now()),
  ('e1000000-0000-4000-8000-0000000000c9', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'dep-c9@example.test', 'hash', now(), '{}', '{"username":"dep_c9"}', now(), now()),
  ('e1000000-0000-4000-8000-0000000000c8', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'dep-c8@example.test', 'hash', now(), '{}', '{"username":"dep_c8"}', now(), now());
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('e3000000-0000-4000-8000-0000000000c1', 'e1000000-0000-4000-8000-0000000000c1', 'TOTP', 'totp', 'verified', now(), now()),
       ('e3000000-0000-4000-8000-0000000000c8', 'e1000000-0000-4000-8000-0000000000c8', 'TOTP', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at)
values ('e2000000-0000-4000-8000-0000000000c1', 'e1000000-0000-4000-8000-0000000000c1', now()),
       ('e2000000-0000-4000-8000-0000000000c9', 'e1000000-0000-4000-8000-0000000000c9', now()),
       ('e2000000-0000-4000-8000-0000000000c8', 'e1000000-0000-4000-8000-0000000000c8', now());
insert into app_private.staff_principals (auth_user_id) values ('e1000000-0000-4000-8000-0000000000c1');
insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select sp.id, r.id, 'Test operator for the dependency guard.'
from app_private.staff_principals sp, app_private.admin_roles r
where sp.auth_user_id = 'e1000000-0000-4000-8000-0000000000c1' and r.name = 'football_operator';
-- Staff, at aal2, but with a role that has no football permission at all.
insert into app_private.staff_principals (auth_user_id) values ('e1000000-0000-4000-8000-0000000000c8');
insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select sp.id, r.id, 'Staff without any football permission, for the read-permission test.'
from app_private.staff_principals sp, app_private.admin_roles r
where sp.auth_user_id = 'e1000000-0000-4000-8000-0000000000c8' and r.name = 'support_agent';

-- 'a' = the operator (aal2, the single approver); 'nobody' = signed in but not staff; 'svc' = the collector.
create function pg_temp.act(p_who text) returns void language plpgsql as $$
begin
  if p_who = 'svc' then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  elsif p_who = 'otherstaff' then
    perform set_config('request.jwt.claims',
      '{"sub":"e1000000-0000-4000-8000-0000000000c8","role":"authenticated","aal":"aal2","session_id":"e2000000-0000-4000-8000-0000000000c8"}', true);
  elsif p_who = 'nobody' then
    perform set_config('request.jwt.claims',
      '{"sub":"e1000000-0000-4000-8000-0000000000c9","role":"authenticated","aal":"aal2","session_id":"e2000000-0000-4000-8000-0000000000c9"}', true);
  else
    perform set_config('request.jwt.claims',
      '{"sub":"e1000000-0000-4000-8000-0000000000c1","role":"authenticated","aal":"aal2","session_id":"e2000000-0000-4000-8000-0000000000c1"}', true);
  end if;
end;
$$;
update app_private.football_mapping_settings set allow_self_approval = true;

-- ===========================================================================
-- 1. The world: players 1-12 take part in the Flashscore batch, 13-20 are spare. Every Sofascore
--    mapping is made through the reviewed flow, which is what leaves its provenance.
-- ===========================================================================
insert into app.teams (id, slug, name, short_name)
select ('e4000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'dep-club-' || g, 'Dep Club ' || g, 'D' || g
from generate_series(1, 4) g;
create temporary table world (i integer primary key, club integer not null, pos text not null, dob date not null, shirt integer not null);
insert into world select i, 1 + (i % 4), (array['G','D','M','F'])[1 + (i % 4)], date '1990-02-02' + (i * 3), 1 + (i % 98)
from generate_series(1, 20) i;
insert into app.players (id, slug, full_name, display_name, position)
select ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'dep-player-' || i, 'Real Name ' || i, 'Display Name ' || i,
  (case pos when 'G' then 'goalkeeper' when 'D' then 'defender' when 'M' then 'midfielder' else 'forward' end)::app.football_position
from world;
insert into app.team_memberships (player_id, team_id, valid_from, shirt_number)
select ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, ('e4000000-0000-4000-8000-' || lpad(club::text, 12, '0'))::uuid, date '2026-07-01', shirt from world;
select app_private.record_player_attribute_observation(('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'date_of_birth', dob::text, null,
  'provider', 'sportsmonks', 'dep-test', '2026-09-01T00:00:00Z') from world;
select app_private.resolve_player_attributes(array(select ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from world));

select pg_temp.act('svc');
select api.football_mapping_record_observations(jsonb_agg(jsonb_build_object(
  'provider', 'sofascore', 'externalPlayerId', 'S' || i, 'providerTeamId', 'PT' || club, 'clubKey', 'dep-club-' || club,
  'appTeamId', 'e4000000-0000-4000-8000-' || lpad(club::text, 12, '0'), 'squadCompleteness', 'COMPLETE',
  'registeredTeamDisagreement', false, 'shirtNumber', shirt, 'positionSignal', pos, 'dobState', 'valid',
  'birthDate', dob::text, 'dobJanuary1', false, 'displayName', 'Provider Name ' || i)))
from world;
select api.football_mapping_record_observations(jsonb_agg(jsonb_build_object(
  'provider', 'flashscore', 'externalPlayerId', 'F' || i, 'providerTeamId', 'FT' || club, 'clubKey', 'dep-club-' || club,
  'appTeamId', 'e4000000-0000-4000-8000-' || lpad(club::text, 12, '0'), 'squadCompleteness', 'COMPLETE',
  'registeredTeamDisagreement', false, 'shirtNumber', shirt, 'positionSignal', pos, 'dobState', 'missing',
  'displayName', 'Flash Name ' || i)))
from world;

create function pg_temp.approve_exec_pending() returns void language plpgsql as $$
declare p record;
begin
  perform pg_temp.act('a');
  for p in select id, fingerprint from app_private.football_player_mapping_proposals where status = 'pending' order by id loop
    perform api.admin_football_mapping_decide(p.id, 'approve', 'Approved to seed the test world.', p.fingerprint, false, gen_random_uuid());
  end loop;
  for p in select id from app_private.football_player_mapping_proposals where status = 'approved' order by id loop
    perform api.admin_football_mapping_execute(p.id, gen_random_uuid());
  end loop;
end;
$$;
create function pg_temp.approve_exec_sofascore_side() returns void language plpgsql as $$
declare p record;
begin
  perform pg_temp.act('a');
  for p in select id, fingerprint from app_private.football_player_mapping_proposals
           where status = 'pending' and flashscore_candidate_id is null and kind <> 'map' order by id loop
    perform api.admin_football_mapping_decide(p.id, 'approve', 'Approved the Sofascore-side change in the test.', p.fingerprint, false, gen_random_uuid());
    perform api.admin_football_mapping_execute(p.id, gen_random_uuid());
  end loop;
end;
$$;
select pg_temp.act('a');
select api.admin_football_mapping_propose(
  (select jsonb_agg(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', c.id,
     'appPlayerId', 'a1000000-0000-4000-8000-' || lpad(substr(c.external_id, 2), 12, '0'), 'basis', 'manual') order by c.id)
   from app_private.football_player_mapping_candidates c where c.provider_name = 'sofascore' and substr(c.external_id, 2)::int between 1 and 14),
  'Seed the Sofascore side of the test world.', gen_random_uuid());
select pg_temp.approve_exec_pending();
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name = 'sofascore' and active), 14,
  '1.1 14 reviewed Sofascore mappings exist, made through the reviewed flow');
-- Baselines for the invariance section.
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
select pg_temp.put('parts', pg_temp.world_parts()::text);
select pg_temp.put('sofa_rows', (select md5(string_agg(m::text, ',' order by m.id)) from app_private.football_provider_mappings m where m.provider_name = 'sofascore'));
select pg_temp.put('audit_ids', (select array_agg(id::text order by id)::text from app_private.admin_audit_events where action like 'football.mapping_%'));
select pg_temp.put('audit_digest', (select md5(string_agg(a::text, ',' order by a.id)) from app_private.admin_audit_events a where a.action like 'football.mapping_%'));
select pg_temp.put('untouched_sofa', (select md5(string_agg(m::text, ',' order by m.id)) from app_private.football_provider_mappings m
  where m.provider_name = 'sofascore' and m.external_id in ('S1', 'S6', 'S8', 'S10', 'S11', 'S12', 'S13', 'S14')));

-- Helpers.
create function pg_temp.mapping_of(p_i integer) returns uuid language sql as
  $$ select id from app_private.football_provider_mappings where provider_name = 'sofascore' and external_id = 'S' || p_i $$;
create function pg_temp.refs(p_i integer) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('source', 'reviewed_sofascore_mapping', 'sofascoreId', 'S' || p_i, 'mappingId', pg_temp.mapping_of(p_i)),
    jsonb_build_object('source', 'finished_match', 'sofascoreFixture', '100' || (p_i % 3), 'flashscoreFixture', 'FX' || (p_i % 3)))
$$;
create function pg_temp.item(p_i integer, p_cls text default 'F1_REVIEWED_SOFASCORE_EVENTS', p_support integer default null, p_player integer default null)
returns jsonb language sql as $$
  select jsonb_build_object('kind', 'map', 'flashscoreCandidateId', c.id,
    'appPlayerId', 'a1000000-0000-4000-8000-' || lpad(coalesce(p_player, p_i)::text, 12, '0'),
    'basis', 'incident', 'evidenceClass', p_cls, 'supportingMappingId', pg_temp.mapping_of(coalesce(p_support, p_i)),
    'evidenceRefs', pg_temp.refs(coalesce(p_support, p_i)))
  from app_private.football_player_mapping_candidates c where c.provider_name = 'flashscore' and c.external_id = 'F' || p_i
$$;
create function pg_temp.propose(p_items jsonb) returns jsonb language sql as $$
  select api.admin_football_mapping_propose(p_items, 'Batch-reviewed Flashscore identity for the dependency test.', gen_random_uuid())
$$;
create function pg_temp.code0(p_items jsonb) returns text language sql as
  $$ select pg_temp.propose(p_items) -> 'proposals' -> 0 ->> 'code' $$;
create function pg_temp.pid(p_flash integer) returns uuid language sql as $$
  select p.id from app_private.football_player_mapping_proposals p
  join app_private.football_player_mapping_candidates c on c.id = p.flashscore_candidate_id
  where c.external_id = 'F' || p_flash and p.status in ('pending', 'approved', 'stale_evidence', 'executed') order by p.requested_at desc limit 1
$$;
create function pg_temp.approve(p_id uuid) returns jsonb language plpgsql as $$
declare fp text;
begin
  select fingerprint into fp from app_private.football_player_mapping_proposals where id = p_id;
  return api.admin_football_mapping_decide(p_id, 'approve', 'Approved after reading the evidence in the test.', fp, false, gen_random_uuid());
end;
$$;
-- Execute directly, the way any authenticated caller can; an error comes back as its message.
create function pg_temp.exec(p_id uuid) returns text language plpgsql as $$
declare v jsonb;
begin
  v := api.admin_football_mapping_execute(p_id, gen_random_uuid());
  return case when (v ->> 'ok')::boolean then 'ok' else v ->> 'code' end;
exception when others then return 'ERR:' || sqlerrm;
end;
$$;

-- ===========================================================================
-- 2. The actual-row read
-- ===========================================================================
select pg_temp.act('a');
select pg_temp.put('r1', api.admin_football_mapping_get_provider_mapping('sofascore', 'S1')::text);
select extensions.is((pg_temp.get('r1')::jsonb ->> 'mappingId')::uuid, pg_temp.mapping_of(1), '2.1 it returns the actual mapping row');
select extensions.is((pg_temp.get('r1')::jsonb ->> 'appPlayerId'), 'a1000000-0000-4000-8000-000000000001', '2.2 with its canonical player');
select extensions.is(((pg_temp.get('r1')::jsonb ->> 'active')::boolean and (pg_temp.get('r1')::jsonb ->> 'reviewed')::boolean), true, '2.3 active and reviewed (computed, not read off a prefix)');
select extensions.is(pg_temp.get('r1')::jsonb ->> 'reviewProvenance', 'executed_proposal', '2.4 the review provenance is an executed proposal');
select extensions.is((select array_agg(k order by k collate "C") from jsonb_object_keys(pg_temp.get('r1')::jsonb) k),
  array['active','appPlayerId','correctedAt','entityType','externalId','manuallyCorrected','mappingId','provenanceProposalId','provider','reviewProvenance','reviewed','sourceVersion','stateDigest','updatedAt'],
  '2.5 only the fields the review needs: no name, no birth date, no secret, no other row');
-- The state digest must not depend on the session's time zone (a timestamp prints in the session zone).
set local time zone 'Pacific/Auckland';
select pg_temp.put('dig_auckland', api.admin_football_mapping_get_provider_mapping('sofascore', 'S1') ->> 'stateDigest');
set local time zone 'America/Los_Angeles';
select pg_temp.put('dig_la', api.admin_football_mapping_get_provider_mapping('sofascore', 'S1') ->> 'stateDigest');
set local time zone 'UTC';
select extensions.is(pg_temp.get('dig_auckland'), pg_temp.get('dig_la'), '2.5b the state digest is the same in any session time zone');
select extensions.is(api.admin_football_mapping_get_provider_mapping('sofascore', 'NO-SUCH-ID'), null, '2.6 an id with no mapping reads as null');
select extensions.throws_ok($$select api.admin_football_mapping_get_provider_mapping('sportsmonks', 'x')$$, 'PT400', 'invalid_filter', '2.7 only the two reviewed providers can be asked for');
select pg_temp.act('nobody');
select extensions.throws_ok($$select api.admin_football_mapping_get_provider_mapping('sofascore', 'S1')$$, null, null, '2.8 a signed-in person who is not staff is refused');
select pg_temp.act('otherstaff');
select extensions.throws_ok($$select api.admin_football_mapping_get_provider_mapping('sofascore', 'S1')$$, 'PT403', 'permission_missing', '2.8b staff who hold no football permission are refused too (the read needs the mapping permission, not just a staff login)');
select pg_temp.act('svc');
select extensions.throws_ok($$select api.admin_football_mapping_get_provider_mapping('sofascore', 'S1')$$, null, null, '2.9 the service role cannot call it either (a staff read)');
select extensions.ok(not has_function_privilege('anon', 'api.admin_football_mapping_get_provider_mapping(text,text)', 'execute')
  and has_function_privilege('authenticated', 'api.admin_football_mapping_get_provider_mapping(text,text)', 'execute'), '2.10 granted to the authenticated role only');
select extensions.ok(not has_table_privilege('authenticated', 'app_private.football_provider_mappings', 'select'), '2.11 and the table itself is not exposed to the browser role');
-- A row written by hand with a review-looking marker is NOT reviewed.
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at,
  manually_corrected, correction_reason, corrected_by, corrected_at)
values ('sofascore', 'player', 'FORGED', 'a1000000-0000-4000-8000-000000000015', 'football_player_mapping:' || (select id::text from app_private.football_player_mapping_proposals order by id limit 1),
  now(), true, 'Looks reviewed but no proposal wrote this row.', 'e1000000-0000-4000-8000-0000000000c1', now());
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
values ('sofascore', 'player', 'PLAINMARK', 'a1000000-0000-4000-8000-000000000016', 'football_player_mapping:11111111-1111-4111-8111-111111111111', now());
select pg_temp.act('a');
select extensions.is((api.admin_football_mapping_get_provider_mapping('sofascore', 'FORGED') ->> 'reviewed')::boolean, false,
  '2.12 a hand-written row with correction fields and a marker naming a real proposal is not reviewed (the audit record does not match)');
select extensions.is((api.admin_football_mapping_get_provider_mapping('sofascore', 'PLAINMARK') ->> 'reviewed')::boolean, false,
  '2.13 a row whose only claim is a version-string prefix is not reviewed');

-- ===========================================================================
-- 3. PROPOSE: the dependency is required, read by the server, and must fit the target
-- ===========================================================================
select pg_temp.act('a');
select extensions.is(pg_temp.code0(jsonb_build_array(pg_temp.item(1) - 'evidenceClass' - 'supportingMappingId')), 'supporting_dependency_required',
  '3.1 a Flashscore map with no dependency fields is refused: there is no ordinary path around it');
select extensions.is(pg_temp.code0(jsonb_build_array(pg_temp.item(1) - 'supportingMappingId')), 'supporting_dependency_required', '3.2 nor with only the class');
select extensions.is(pg_temp.code0(jsonb_build_array(pg_temp.item(1) - 'evidenceClass')), 'supporting_dependency_required', '3.3 nor with only the mapping');
select extensions.is(pg_temp.code0(jsonb_build_array(pg_temp.item(1, 'F9_MADE_UP'))), 'supporting_dependency_invalid', '3.4 an unknown evidence class is refused');
select extensions.is(pg_temp.code0(jsonb_build_array(pg_temp.item(1) - 'evidenceRefs')), 'evidence_refs_required', '3.5 a bound proposal must carry its evidence references');
select extensions.is(pg_temp.code0(jsonb_build_array(pg_temp.item(1) || jsonb_build_object('supportingMappingId', gen_random_uuid()))), 'supporting_mapping_missing', '3.6 a made-up mapping id is refused');
select extensions.is(pg_temp.code0(jsonb_build_array(pg_temp.item(1) || jsonb_build_object('supportingMappingValid', true, 'supportingMappingId', null))), 'supporting_dependency_required',
  '3.7 a client saying "supportingMappingValid: true" is not evidence');
select extensions.is(pg_temp.code0(jsonb_build_array(pg_temp.item(1, 'F1_REVIEWED_SOFASCORE_EVENTS', null, 2))), 'supporting_mapping_target_mismatch',
  '3.8 the supporting mapping must resolve to the proposed canonical player');
select extensions.is(pg_temp.code0(jsonb_build_array(pg_temp.item(1) || jsonb_build_object('supportingMappingId', (select id from app_private.football_provider_mappings where external_id = 'FORGED')))), 'supporting_mapping_unreviewed',
  '3.9 a hand-written Sofascore row, however it looks, cannot support a proposal');
select extensions.is(pg_temp.code0(jsonb_build_array(pg_temp.item(1) || jsonb_build_object('supportingMappingId', (select id from app_private.football_provider_mappings where external_id = 'PLAINMARK')))), 'supporting_mapping_unreviewed',
  '3.9b (and so is a row whose only claim is its marker)');
select pg_temp.put('sm_map', (select id::text from app_private.football_provider_mappings where provider_name = 'sportsmonks' limit 1));
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
values ('sportsmonks', 'player', 'SM-1', 'a1000000-0000-4000-8000-000000000001', 'test', now());
select extensions.is(pg_temp.code0(jsonb_build_array(pg_temp.item(1) || jsonb_build_object('supportingMappingId', (select id from app_private.football_provider_mappings where external_id = 'SM-1')))), 'supporting_mapping_not_sofascore',
  '3.10 only a Sofascore mapping can support it');
select extensions.is((select jsonb_array_elements(api.admin_football_mapping_propose(jsonb_build_array(
    (select jsonb_build_object('kind', 'map', 'sofascoreCandidateId', c.id, 'appPlayerId', 'a1000000-0000-4000-8000-000000000017', 'basis', 'manual', 'evidenceClass', 'F1_REVIEWED_SOFASCORE_EVENTS', 'evidenceRefs', pg_temp.refs(1))
     from app_private.football_player_mapping_candidates c where c.provider_name = 'sofascore' and c.external_id = 'S17')),
  'A Sofascore proposal must carry no dependency.', gen_random_uuid()) -> 'proposals') ->> 'code'), 'supporting_dependency_not_applicable',
  '3.11 a Sofascore proposal carrying dependency fields is refused');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where flashscore_candidate_id is not null), 0, '3.13 none of those refusals created a proposal');
-- The table refuses what the function refuses, whoever writes to it.
select extensions.throws_ok($$insert into app_private.football_player_mapping_proposals (batch_id, kind, status, flashscore_candidate_id, flashscore_external_id,
    app_player_id, basis, evidence, signals, candidate_revisions, reason, requested_by, expires_at, fingerprint)
  select gen_random_uuid(), 'map', 'pending', c.id, c.external_id, 'a1000000-0000-4000-8000-000000000001', 'manual', '{}', '{}', '{}',
    'A Flashscore map with no dependency on the table.', (select id from app_private.staff_principals limit 1), now() + interval '1 day', repeat('a', 64)
  from app_private.football_player_mapping_candidates c where c.external_id = 'F1'$$, '23514', null,
  '3.14 even a direct table insert cannot create a Flashscore map without its dependency');

-- ===========================================================================
-- 4. A valid dependency succeeds, end to end
-- ===========================================================================
select pg_temp.put('batch', pg_temp.propose(jsonb_build_array(pg_temp.item(1), pg_temp.item(2, 'F2_REVIEWED_SOFASCORE_SHIRT_DOB'), pg_temp.item(3), pg_temp.item(4), pg_temp.item(5), pg_temp.item(6)))::text);
select extensions.is((select count(*)::int from jsonb_array_elements(pg_temp.get('batch')::jsonb -> 'proposals') p where (p ->> 'ok')::boolean), 6, '4.1 six dependency-bound proposals created');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals p where p.flashscore_candidate_id is not null
  and p.supporting_mapping_id is not null and p.evidence_class is not null and p.evidence -> 'supporting' ->> 'mappingId' = p.supporting_mapping_id::text), 6,
  '4.2 each persists the supporting mapping reference and the class');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals p where p.flashscore_candidate_id is not null
  and (p.evidence -> 'supporting' ->> 'active')::boolean and (p.evidence -> 'supporting' ->> 'reviewed')::boolean
  and p.evidence -> 'supporting' ->> 'appPlayerId' = p.app_player_id::text and p.evidence -> 'supporting' ->> 'stateDigest' ~ '^[a-f0-9]{64}$'
  and p.evidence ->> 'refsDigest' ~ '^[a-f0-9]{64}$'), 6, '4.3 and the state the SERVER read: active, reviewed, same player, a state digest, a digest of the evidence references');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals p
  where p.flashscore_candidate_id is not null and app_private.football_mapping_row_fingerprint(p) = p.fingerprint), 6, '4.4 the fingerprint covers all of it and the database recomputes it');
select extensions.is((select count(distinct evidence_class)::int from app_private.football_player_mapping_proposals where flashscore_candidate_id is not null), 2, '4.5 both evidence classes are accepted');
select extensions.throws_ok(format($f$update app_private.football_player_mapping_proposals set supporting_mapping_id = %L where id = %L$f$, pg_temp.mapping_of(9), pg_temp.pid(1)),
  '42501', 'football_mapping_proposal_payload_is_immutable', '4.6 the dependency is immutable once proposed');
select extensions.throws_ok(format($f$update app_private.football_player_mapping_proposals set evidence_class = 'F2_REVIEWED_SOFASCORE_SHIRT_DOB' where id = %L$f$, pg_temp.pid(1)),
  '42501', 'football_mapping_proposal_payload_is_immutable', '4.7 and so is the class');
select pg_temp.put('fp1', (select fingerprint from app_private.football_player_mapping_proposals where id = pg_temp.pid(1)));
select extensions.throws_ok(format($f$select api.admin_football_mapping_decide(%L, 'approve', 'Approved with someone else''s fingerprint.', %L, false, gen_random_uuid())$f$, pg_temp.pid(2), pg_temp.get('fp1')),
  'PT409', 'fingerprint_mismatch', '4.8 approving with a stale or wrong fingerprint is refused');
select extensions.is((pg_temp.approve(pg_temp.pid(1)) ->> 'ok')::boolean, true, '4.9 a valid dependency is approved');
select pg_temp.approve(pg_temp.pid(2)); select pg_temp.approve(pg_temp.pid(3)); select pg_temp.approve(pg_temp.pid(4));
select pg_temp.approve(pg_temp.pid(5)); select pg_temp.approve(pg_temp.pid(6));
select extensions.is(pg_temp.exec(pg_temp.pid(1)), 'ok', '4.10 and executed, by a direct call to the execute function');
select extensions.is((select source_version from app_private.football_provider_mappings where provider_name = 'flashscore' and external_id = 'F1'),
  'football_player_mapping:' || pg_temp.pid(1)::text, '4.11 the Flashscore mapping exists, written by that proposal');

-- ===========================================================================
-- 5. EXECUTE refuses, writing nothing, when the supporting mapping broke after approval
-- ===========================================================================
-- (2) deactivated, (3) retargeted, (4) review state removed, (5) changed by hand under its old marker.
update app_private.football_provider_mappings set active = false where id = pg_temp.mapping_of(2);
update app_private.football_provider_mappings set internal_entity_id = 'a1000000-0000-4000-8000-000000000017' where id = pg_temp.mapping_of(3);
update app_private.football_provider_mappings set manually_corrected = false, correction_reason = null, corrected_by = null, corrected_at = null where id = pg_temp.mapping_of(4);
update app_private.football_provider_mappings set internal_entity_id = 'a1000000-0000-4000-8000-000000000018' where id = pg_temp.mapping_of(5);
select pg_temp.act('a');
select extensions.is(pg_temp.exec(pg_temp.pid(2)), 'supporting_mapping_inactive', '5.1 supporting mapping deactivated after approval: refused with a stable code');
select extensions.is(pg_temp.exec(pg_temp.pid(3)), 'supporting_mapping_unreviewed', '5.2 retargeted by hand after approval: refused (the row no longer matches the audit record that made it reviewed)');
select extensions.is(pg_temp.exec(pg_temp.pid(4)), 'supporting_mapping_unreviewed', '5.3 review state removed: refused');
select extensions.is(pg_temp.exec(pg_temp.pid(5)), 'supporting_mapping_unreviewed', '5.4 changed outside the proposal workflow while the old marker remains: refused');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name = 'flashscore' and external_id in ('F2', 'F3', 'F4', 'F5')), 0,
  '5.5 each refusal created no mapping');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where flashscore_candidate_id is not null and status = 'stale_evidence'
  and hold_code like 'supporting_mapping_%'), 4, '5.6 each is remembered as held, with its reason, never retried silently');
select extensions.is(pg_temp.exec(pg_temp.pid(6)), 'ok', '5.7 one refused row leaves the others usable: F6, with a healthy supporting mapping, executes');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name = 'flashscore' and source_version like 'football_player_mapping:%'), 2,
  '5.8 exactly two Flashscore mappings exist (F1 and F6)');
select extensions.is((select count(*)::int from app_private.football_player_mapping_candidates where provider_name = 'flashscore' and status = 'mapped'), 2, '5.9 and only their candidates are mapped');
-- Approval is guarded too: break a supporting mapping BEFORE approval.
select pg_temp.put('late', pg_temp.propose(jsonb_build_array(pg_temp.item(7), pg_temp.item(8)))::text);
update app_private.football_provider_mappings set active = false where id = pg_temp.mapping_of(7);
select extensions.is((pg_temp.approve(pg_temp.pid(7)) ->> 'code'), 'supporting_mapping_inactive', '5.10 approving a proposal whose supporting mapping has just broken is held, not approved');
select extensions.is((pg_temp.approve(pg_temp.pid(8)) ->> 'ok')::boolean, true, '5.11 a healthy sibling in the same batch is approved');
-- A direct execute of a proposal that was never approved is still refused.
select extensions.is(pg_temp.exec(pg_temp.pid(8)), 'ok', '5.12 and executes');

-- ===========================================================================
-- 6. Refresh: a restored dependency recovers a held proposal, with a new fingerprint and a new approval
-- ===========================================================================
update app_private.football_provider_mappings set active = true where id = pg_temp.mapping_of(2);
select pg_temp.put('old_fp2', (select fingerprint from app_private.football_player_mapping_proposals where id = pg_temp.pid(2)));
select extensions.is((api.admin_football_mapping_refresh_evidence(pg_temp.pid(2), gen_random_uuid()) ->> 'ok')::boolean, true,
  '6.1 with the supporting mapping restored, the held proposal can be refreshed');
select extensions.is((select status from app_private.football_player_mapping_proposals where id = pg_temp.pid(2)), 'pending', '6.2 back to pending: the earlier approval no longer applies');
select extensions.is((select fingerprint = pg_temp.get('old_fp2') from app_private.football_player_mapping_proposals where id = pg_temp.pid(2)), true,
  '6.3 (the supporting state is identical, so the evidence and the fingerprint are the same)');
select extensions.is((pg_temp.approve(pg_temp.pid(2)) ->> 'ok')::boolean, true, '6.4 approved again');
select extensions.is(pg_temp.exec(pg_temp.pid(2)), 'ok', '6.5 and executed');
-- A supporting mapping legitimately changed through the reviewed flow (deactivate, then reactivate) has a NEW state.
select pg_temp.put('x9', pg_temp.propose(jsonb_build_array(pg_temp.item(9)))::text);
select pg_temp.put('x9fp', (select evidence -> 'supporting' ->> 'stateDigest' from app_private.football_player_mapping_proposals where id = pg_temp.pid(9)));
select pg_temp.approve(pg_temp.pid(9));
select api.admin_football_mapping_propose(jsonb_build_array(jsonb_build_object('kind', 'deactivate', 'providerName', 'sofascore', 'mappingId', pg_temp.mapping_of(9))), 'Deactivate a supporting mapping through the reviewed flow.', gen_random_uuid());
select pg_temp.approve_exec_sofascore_side();
select api.admin_football_mapping_propose(jsonb_build_array(jsonb_build_object('kind', 'reactivate', 'providerName', 'sofascore', 'mappingId', pg_temp.mapping_of(9))), 'Reactivate the supporting mapping through the reviewed flow.', gen_random_uuid());
select pg_temp.approve_exec_sofascore_side();
select extensions.is(pg_temp.exec(pg_temp.pid(9)), 'supporting_mapping_changed',
  '6.6 a supporting mapping that was changed and restored through the reviewed flow is a NEW state (new version, new provenance): the old approval is refused and must be refreshed');

-- ===========================================================================
-- 7. Replace, reactivate and deactivate of a Flashscore mapping
-- ===========================================================================
select extensions.is((api.admin_football_mapping_propose(jsonb_build_array(jsonb_build_object('kind', 'replace', 'providerName', 'flashscore',
    'mappingId', (select id from app_private.football_provider_mappings where provider_name = 'flashscore' and external_id = 'F1'),
    'newAppPlayerId', 'a1000000-0000-4000-8000-000000000019')), 'Retarget a Flashscore mapping with no dependency.', gen_random_uuid()) -> 'proposals' -> 0 ->> 'code'),
  'supporting_dependency_required', '7.1 retargeting a Flashscore mapping without a dependency is refused');
select extensions.is((api.admin_football_mapping_propose(jsonb_build_array(jsonb_build_object('kind', 'deactivate', 'providerName', 'flashscore',
    'mappingId', (select id from app_private.football_provider_mappings where provider_name = 'flashscore' and external_id = 'F1'),
    'evidenceClass', 'F1_REVIEWED_SOFASCORE_EVENTS', 'supportingMappingId', pg_temp.mapping_of(1), 'evidenceRefs', pg_temp.refs(1))), 'Deactivation carries no dependency.', gen_random_uuid()) -> 'proposals' -> 0 ->> 'code'),
  'supporting_dependency_not_applicable', '7.2 a deactivation takes no dependency');
select extensions.is((api.admin_football_mapping_propose(jsonb_build_array(jsonb_build_object('kind', 'deactivate', 'providerName', 'flashscore',
    'mappingId', (select id from app_private.football_provider_mappings where provider_name = 'flashscore' and external_id = 'F1'))), 'Deactivate a Flashscore mapping, the safe direction.', gen_random_uuid()) -> 'proposals' -> 0 ->> 'ok')::boolean,
  true, '7.3 deactivating a Flashscore mapping needs none (it only removes a link)');
select pg_temp.approve_exec_sofascore_side();
select extensions.is((select active from app_private.football_provider_mappings where provider_name = 'flashscore' and external_id = 'F1'), false, '7.4 it deactivated');
select extensions.is((api.admin_football_mapping_propose(jsonb_build_array(jsonb_build_object('kind', 'reactivate', 'providerName', 'flashscore',
    'mappingId', (select id from app_private.football_provider_mappings where provider_name = 'flashscore' and external_id = 'F1'))), 'Reactivate with no dependency.', gen_random_uuid()) -> 'proposals' -> 0 ->> 'code'),
  'supporting_dependency_required', '7.5 reactivating a Flashscore mapping without a dependency is refused');
select extensions.is((api.admin_football_mapping_propose(jsonb_build_array(jsonb_build_object('kind', 'reactivate', 'providerName', 'flashscore',
    'mappingId', (select id from app_private.football_provider_mappings where provider_name = 'flashscore' and external_id = 'F1'),
    'evidenceClass', 'F1_REVIEWED_SOFASCORE_EVENTS', 'supportingMappingId', pg_temp.mapping_of(1), 'evidenceRefs', pg_temp.refs(1))), 'Reactivate with its dependency.', gen_random_uuid()) -> 'proposals' -> 0 ->> 'ok')::boolean,
  true, '7.6 with its dependency it is proposed');

-- ===========================================================================
-- 8. Sofascore behaviour is unchanged
-- ===========================================================================
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where ((kind = 'map' and flashscore_candidate_id is null) or provider_name = 'sofascore')
  and (evidence ? 'supporting' or evidence ? 'refsDigest' or evidence_class is not null or supporting_mapping_id is not null)), 0, '8.1 no Sofascore proposal carries a dependency or a changed evidence shape');
select pg_temp.put('s15', (api.admin_football_mapping_propose(jsonb_build_array(jsonb_build_object('kind', 'map',
  'sofascoreCandidateId', (select id from app_private.football_player_mapping_candidates where external_id = 'S15'),
  'appPlayerId', 'a1000000-0000-4000-8000-000000000015', 'basis', 'manual')), 'A plain Sofascore proposal.', gen_random_uuid()) -> 'proposals' -> 0)::text);
select extensions.is((pg_temp.get('s15')::jsonb ->> 'ok')::boolean, false, '8.2 (S15 maps to player 15, which the hand-written FORGED row already holds: refused as before)');
select extensions.is(pg_temp.get('s15')::jsonb ->> 'code', 'already_mapped', '8.2b with the reason it always gave');
select pg_temp.put('s14', (select id::text from app_private.football_player_mapping_proposals where sofascore_candidate_id = (select id from app_private.football_player_mapping_candidates where external_id = 'S14') and status = 'executed'));
select extensions.is((select app_private.football_mapping_row_fingerprint(p) = p.fingerprint from app_private.football_player_mapping_proposals p where p.id = pg_temp.get('s14')::uuid), true,
  '8.3 an existing executed Sofascore proposal still recomputes its own fingerprint');
select extensions.is((select jsonb_object_keys(evidence) from app_private.football_player_mapping_proposals where id = pg_temp.get('s14')::uuid order by 1 limit 1), 'appPlayerId', '8.4 and its evidence has the shape it always had');

-- A proposal mapping a Sofascore AND a Flashscore identity to one player creates both in one reviewed
-- transaction and rests on nothing outside it: it takes no dependency, and refuses one.
select extensions.is((api.admin_football_mapping_propose(jsonb_build_array(
    jsonb_build_object('kind', 'map', 'sofascoreCandidateId', (select id from app_private.football_player_mapping_candidates where external_id = 'S20'),
      'flashscoreCandidateId', (select id from app_private.football_player_mapping_candidates where external_id = 'F20'),
      'appPlayerId', 'a1000000-0000-4000-8000-000000000020', 'basis', 'manual',
      'evidenceClass', 'F1_REVIEWED_SOFASCORE_EVENTS', 'supportingMappingId', pg_temp.mapping_of(1), 'evidenceRefs', pg_temp.refs(1))),
  'A combined proposal takes no dependency.', gen_random_uuid()) -> 'proposals' -> 0 ->> 'code'), 'supporting_dependency_not_applicable',
  '8.5 a combined Sofascore + Flashscore proposal refuses dependency fields');
select extensions.is((api.admin_football_mapping_propose(jsonb_build_array(
    jsonb_build_object('kind', 'map', 'sofascoreCandidateId', (select id from app_private.football_player_mapping_candidates where external_id = 'S20'),
      'flashscoreCandidateId', (select id from app_private.football_player_mapping_candidates where external_id = 'F20'),
      'appPlayerId', 'a1000000-0000-4000-8000-000000000020', 'basis', 'manual')),
  'A combined proposal: both identities created together.', gen_random_uuid()) -> 'proposals' -> 0 ->> 'ok')::boolean, true,
  '8.6 and without them it is proposed as it always was');
select extensions.is((select evidence_class is null and supporting_mapping_id is null and not (evidence ? 'supporting')
  from app_private.football_player_mapping_proposals where sofascore_candidate_id = (select id from app_private.football_player_mapping_candidates where external_id = 'S20')), true,
  '8.7 it carries no dependency (it rests on nothing outside its own transaction)');

-- A combined proposal is not a way round the dependency: it is allowed only while BOTH identities are new.
-- Reusing an already-mapped Sofascore candidate, or a player a Sofascore mapping already holds, is refused.
select pg_temp.put('props_before_combined', (select count(*)::text from app_private.football_player_mapping_proposals));
select extensions.is((api.admin_football_mapping_propose(jsonb_build_array(
    jsonb_build_object('kind', 'map', 'sofascoreCandidateId', (select id from app_private.football_player_mapping_candidates where external_id = 'S13'),
      'flashscoreCandidateId', (select id from app_private.football_player_mapping_candidates where external_id = 'F19'),
      'appPlayerId', 'a1000000-0000-4000-8000-000000000013', 'basis', 'manual')),
  'Combined, reusing an already-mapped Sofascore candidate.', gen_random_uuid()) -> 'proposals' -> 0 ->> 'code'), 'already_mapped',
  '8.8 a combined proposal that reuses an already-mapped Sofascore candidate is refused');
select extensions.is((api.admin_football_mapping_propose(jsonb_build_array(
    jsonb_build_object('kind', 'map', 'sofascoreCandidateId', (select id from app_private.football_player_mapping_candidates where external_id = 'S19'),
      'flashscoreCandidateId', (select id from app_private.football_player_mapping_candidates where external_id = 'F19'),
      'appPlayerId', 'a1000000-0000-4000-8000-000000000014', 'basis', 'manual')),
  'Combined, onto a player a Sofascore mapping already holds.', gen_random_uuid()) -> 'proposals' -> 0 ->> 'code'), 'already_mapped',
  '8.9 a combined proposal onto a player that already has a Sofascore mapping is refused');
select extensions.is((api.admin_football_mapping_propose(jsonb_build_array(
    jsonb_build_object('kind', 'map', 'sofascoreCandidateId', (select id from app_private.football_player_mapping_candidates where external_id = 'S13'),
      'flashscoreCandidateId', (select id from app_private.football_player_mapping_candidates where external_id = 'F19'),
      'appPlayerId', 'a1000000-0000-4000-8000-000000000013', 'basis', 'manual',
      'evidenceClass', 'F1_REVIEWED_SOFASCORE_EVENTS', 'supportingMappingId', pg_temp.mapping_of(13), 'evidenceRefs', pg_temp.refs(13))),
  'Combined, claiming the dependency of the mapping it reuses.', gen_random_uuid()) -> 'proposals' -> 0 ->> 'ok')::boolean, false,
  '8.10 and naming that mapping as its dependency does not get it through either');
select extensions.is((select count(*)::text from app_private.football_player_mapping_proposals), pg_temp.get('props_before_combined'),
  '8.11 none of those refusals created a proposal');

-- ===========================================================================
-- 9. Invariance
-- ===========================================================================
select extensions.is((select md5(string_agg(m::text, ',' order by m.id)) from app_private.football_provider_mappings m
  where m.provider_name = 'sofascore' and m.external_id in ('S1', 'S6', 'S8', 'S10', 'S11', 'S12', 'S13', 'S14')), pg_temp.get('untouched_sofa'),
  '9.0 the completed Sofascore mappings the lifecycle did not itself change are byte-for-byte unchanged');
select extensions.is((select md5(string_agg(a::text, ',' order by a.id)) from app_private.admin_audit_events a
  where a.id::text = any (pg_temp.get('audit_ids')::text[])), pg_temp.get('audit_digest'),
  '9.0b and every audit event written before the Flashscore lifecycle is unchanged (append-only history)');
select extensions.is((select coalesce(jsonb_object_agg(k, 'changed'), '{}'::jsonb)::text from jsonb_each(pg_temp.world_parts()) e(k, v) where v is distinct from (pg_temp.get('parts')::jsonb -> k)), '{}',
  '9.1 players, memberships, Fantasy tables, scoring snapshots, automation settings and cron jobs are unchanged by the whole Flashscore lifecycle');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name = 'flashscore' and source_version like 'football_player_mapping:%'), 4,
  '9.2 only the Flashscore mappings that passed the guard exist (F1 reactivation is proposed, not executed)');
select * from extensions.finish();
rollback;
