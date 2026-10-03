begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- The Flashscore evidence batch against the REAL database functions, on a synthetic world. No
-- migration is involved: the batch reuses propose (<= 25 items a call, one reason a call), approve
-- and execute, one proposal at a time, exactly like the completed Sofascore batch. Each Flashscore
-- row rests on a Sofascore mapping that already exists, so the Sofascore side is first mapped through
-- the real reviewed flow (which is what leaves the audit trail the client reads back).
--
-- What the database itself does NOT do, and the client therefore must (and is tested to): re-check
-- that the supporting Sofascore mapping is still active, still on the same player and still at the
-- same version. Section 6 pins that fact so a future change to it shows up here.

create temporary table stash (k text primary key, v text);
create function pg_temp.put(p_key text, p_value text) returns void language sql as
  $$ insert into stash values (p_key, p_value) on conflict (k) do update set v = excluded.v $$;
create function pg_temp.get(p_key text) returns text language sql as
  $$ select v from stash where k = p_key $$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e1000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'flash-b1@example.test', 'hash', now(), '{}', '{"username":"flash_b1"}', now(), now());
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('e3000000-0000-4000-8000-0000000000b1', 'e1000000-0000-4000-8000-0000000000b1', 'TOTP', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at)
values ('e2000000-0000-4000-8000-0000000000b1', 'e1000000-0000-4000-8000-0000000000b1', now());
insert into app_private.staff_principals (auth_user_id) values ('e1000000-0000-4000-8000-0000000000b1');
insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select sp.id, r.id, 'Test operator for the Flashscore batch.'
from app_private.staff_principals sp, app_private.admin_roles r
where sp.auth_user_id = 'e1000000-0000-4000-8000-0000000000b1' and r.name = 'football_operator';

-- 'a' = the operator on a fresh aal2 session; 'weak' = the same operator on an aal1 session.
create function pg_temp.act(p_who text) returns void language plpgsql as $$
begin
  if p_who = 'svc' then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  elsif p_who = 'weak' then
    perform set_config('request.jwt.claims',
      '{"sub":"e1000000-0000-4000-8000-0000000000b1","role":"authenticated","aal":"aal1","session_id":"e2000000-0000-4000-8000-0000000000b1"}', true);
  else
    perform set_config('request.jwt.claims',
      '{"sub":"e1000000-0000-4000-8000-0000000000b1","role":"authenticated","aal":"aal2","session_id":"e2000000-0000-4000-8000-0000000000b1"}', true);
  end if;
end;
$$;

update app_private.football_mapping_settings set allow_self_approval = true;

-- ===========================================================================
-- 0. The synthetic world: 62 players
--    1-20  Flashscore rows of class F1 (events)
--    21-40 Flashscore rows of class F2 (shirt + birth date)
--    41-60 mapped on the Sofascore side only; their Flashscore id is not in the batch
--    61    a Flashscore id whose position disagrees with the catalogue
--    62    a Flashscore id observed at a different club than the catalogue's
-- ===========================================================================
insert into app.teams (id, slug, name, short_name)
select ('e4000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'flash-club-' || g, 'Flash Club ' || g, 'F' || g
from generate_series(1, 6) g;

create temporary table world (i integer primary key, cls text not null, club integer not null, pos text not null, dob date not null, shirt integer not null);
insert into world
select i, case when i <= 20 then 'F1' when i <= 40 then 'F2' when i <= 60 then 'spare' when i = 61 then 'posConf' else 'clubMis' end,
  1 + (i % 5), (array['G','D','M','F'])[1 + (i % 4)], date '1990-02-02' + (i * 3), 1 + (i % 98)
from generate_series(1, 62) i;

insert into app.players (id, slug, full_name, display_name, position)
select ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'flash-player-' || i, 'Real Name ' || i, 'Display Name ' || i,
  (case pos when 'G' then 'goalkeeper' when 'D' then 'defender' when 'M' then 'midfielder' else 'forward' end)::app.football_position
from world;
insert into app.team_memberships (player_id, team_id, valid_from, shirt_number)
select ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, ('e4000000-0000-4000-8000-' || lpad(club::text, 12, '0'))::uuid, date '2026-07-01', shirt
from world;
select app_private.record_player_attribute_observation(('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'date_of_birth', dob::text, null,
  'provider', 'sportsmonks', 'flash-test', '2026-09-01T00:00:00Z') from world;
select app_private.resolve_player_attributes(array(select ('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from world));

-- A spare player nobody maps: used to claim a Flashscore id by hand in section 4.
insert into app.players (id, slug, full_name, display_name, position) values ('a1000000-0000-4000-8000-000000000063', 'flash-player-63', 'Real Name 63', 'Display Name 63', 'defender');
select pg_temp.act('svc');
-- Sofascore candidates: exact date of birth, same club, same position, same shirt.
select api.football_mapping_record_observations(jsonb_agg(jsonb_build_object(
  'provider', 'sofascore', 'externalPlayerId', 'S' || i, 'providerTeamId', 'PT' || club, 'clubKey', 'flash-club-' || club,
  'appTeamId', 'e4000000-0000-4000-8000-' || lpad(club::text, 12, '0'), 'squadCompleteness', 'COMPLETE',
  'registeredTeamDisagreement', false, 'shirtNumber', shirt, 'positionSignal', pos, 'dobState', 'valid',
  'birthDate', dob::text, 'dobJanuary1', false, 'displayName', 'Provider Name ' || i)))
from world where i <= 60;
-- Flashscore candidates: no birth date, observed from a squad list.
select api.football_mapping_record_observations(jsonb_agg(jsonb_build_object(
  'provider', 'flashscore', 'externalPlayerId', 'F' || i, 'providerTeamId', 'FT' || club, 'clubKey', 'flash-club-' || club,
  'appTeamId', case when cls = 'clubMis' then 'e4000000-0000-4000-8000-' || lpad(((club % 5) + 1)::text, 12, '0')
                    else 'e4000000-0000-4000-8000-' || lpad(club::text, 12, '0') end,
  'squadCompleteness', 'COMPLETE', 'registeredTeamDisagreement', false, 'shirtNumber', shirt,
  'positionSignal', case when cls = 'posConf' then (array['D','M','F','G'])[1 + (i % 4)] else pos end,
  'dobState', 'missing', 'displayName', 'Flash Name ' || i)))
from world;

select extensions.is((select count(*)::int from app_private.football_player_mapping_candidates), 122, '0.1 60 + 62 candidates');

-- Baselines.
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
select pg_temp.put('world_parts', pg_temp.world_parts()::text);

-- ===========================================================================
-- 1. The Sofascore side, through the reviewed flow (what the supporting mappings are)
-- ===========================================================================
select pg_temp.act('a');
select api.admin_football_mapping_propose(
  (select jsonb_agg(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', c.id, 'appPlayerId', ('a1000000-0000-4000-8000-' || lpad(substr(c.external_id, 2), 12, '0')), 'basis', 'manual') order by c.id)
   from app_private.football_player_mapping_candidates c where c.provider_name = 'sofascore' and substr(c.external_id, 2)::int between 1 and 25),
  'Seed the Sofascore side of the test world, first part.', gen_random_uuid());
select api.admin_football_mapping_propose(
  (select jsonb_agg(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', c.id, 'appPlayerId', ('a1000000-0000-4000-8000-' || lpad(substr(c.external_id, 2), 12, '0')), 'basis', 'manual') order by c.id)
   from app_private.football_player_mapping_candidates c where c.provider_name = 'sofascore' and substr(c.external_id, 2)::int between 26 and 50),
  'Seed the Sofascore side of the test world, second part.', gen_random_uuid());
select api.admin_football_mapping_propose(
  (select jsonb_agg(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', c.id, 'appPlayerId', ('a1000000-0000-4000-8000-' || lpad(substr(c.external_id, 2), 12, '0')), 'basis', 'manual') order by c.id)
   from app_private.football_player_mapping_candidates c where c.provider_name = 'sofascore' and substr(c.external_id, 2)::int between 51 and 60),
  'Seed the Sofascore side of the test world, third part.', gen_random_uuid());
create function pg_temp.approve_and_execute_all() returns void language plpgsql as $$
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
select pg_temp.approve_and_execute_all();
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name = 'sofascore' and active and source_version like 'football_player_mapping:%'), 60,
  '1.1 60 reviewed Sofascore mappings exist, each stamped by its own proposal');
select pg_temp.put('sofa_digest', (select md5(string_agg(m::text, ',' order by m.id)) from app_private.football_provider_mappings m where m.provider_name = 'sofascore'));
select pg_temp.put('world_parts', pg_temp.world_parts()::text);

-- ===========================================================================
-- 2. The manifest's own computation, then PROPOSE in bounded calls, one reason per call
-- ===========================================================================
create function pg_temp.reason(p_cls text) returns text language sql as $$
  select case p_cls
    when 'F1' then 'Batch-reviewed Flashscore identity: in a finished match both providers list as the same fixture, this Flashscore id and a Sofascore player whose mapping to this canonical player is active and reviewed share aligned match events (goal, assist, card or substitution) and an agreeing shirt number, or at least two distinct aligned events. Names were not compared.'
    else 'Batch-reviewed Flashscore identity: in a finished match both providers list as the same fixture, this Flashscore id and a Sofascore player whose mapping to this canonical player is active and reviewed share the same shirt number, and the birth date Flashscore reports agrees with the one Sofascore reports for that player. The date agreement is corroboration, not proof. Names were not compared.' end
$$;
create function pg_temp.basis(p_cls text) returns text language sql as $$ select case p_cls when 'F1' then 'incident' else 'shirt_position' end $$;
create function pg_temp.refs(p_i integer, p_cls text) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('source', 'reviewed_sofascore_mapping', 'sofascoreId', 'S' || p_i,
      'mappingId', (select m.id from app_private.football_provider_mappings m where m.provider_name = 'sofascore' and m.external_id = 'S' || p_i)),
    jsonb_build_object('source', 'finished_match', 'evidenceClass', p_cls || '_CLASS', 'sofascoreFixture', '1000' || (p_i % 3), 'flashscoreFixture', 'FX' || (p_i % 3)))
$$;
create function pg_temp.item(p_i integer, p_cls text) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'map', 'flashscoreCandidateId', c.id,
    'appPlayerId', 'a1000000-0000-4000-8000-' || lpad(p_i::text, 12, '0'), 'basis', pg_temp.basis(p_cls), 'evidenceRefs', pg_temp.refs(p_i, p_cls))
  from app_private.football_player_mapping_candidates c where c.provider_name = 'flashscore' and c.external_id = 'F' || p_i
$$;
create function pg_temp.items(p_cls text) returns jsonb language sql as $$
  select jsonb_agg(pg_temp.item(i, p_cls) order by i) from world where cls = p_cls
$$;

-- What the manifest builder's SELECT computes (compute + the same fingerprint expression), BEFORE any proposal exists.
create function pg_temp.expected(p_i integer, p_cls text) returns text language sql as $$
  with c as (
    select k.id as cand, 'a1000000-0000-4000-8000-' || lpad(p_i::text, 12, '0') as tgt,
      app_private.football_mapping_compute('map', null, k.id, null, null, ('a1000000-0000-4000-8000-' || lpad(p_i::text, 12, '0'))::uuid, null, null) as v
    from app_private.football_player_mapping_candidates k where k.provider_name = 'flashscore' and k.external_id = 'F' || p_i)
  select app_private.admin_payload_fingerprint(jsonb_build_object(
    'kind', 'map', 'sofascoreCandidateId', null, 'flashscoreCandidateId', c.cand,
    'sofascoreExternalId', c.v ->> 'sofascoreExternalId', 'flashscoreExternalId', c.v ->> 'flashscoreExternalId',
    'providerName', c.v ->> 'providerName', 'mappingId', null, 'appPlayerId', c.tgt::uuid, 'newExternalId', null, 'newAppPlayerId', null,
    'expectedBefore', nullif(c.v -> 'expectedBefore', 'null'::jsonb), 'basis', pg_temp.basis(p_cls),
    'evidence', (c.v -> 'evidence') || jsonb_build_object('refs', pg_temp.refs(p_i, p_cls)),
    'signals', c.v -> 'signals', 'candidateRevisions', c.v -> 'candidateRevisions',
    'positionDisagreement', (c.v ->> 'positionDisagreement')::boolean, 'positionNote', null, 'reason', pg_temp.reason(p_cls)))
  from c
$$;
create temporary table frozen as select i, cls, pg_temp.expected(i, cls) as fp from world where cls in ('F1', 'F2');
select extensions.is((select count(*)::int from frozen where fp is not null), 40, '2.0 the manifest computation gives every one of the 40 rows a fingerprint before any proposal exists');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where flashscore_candidate_id is not null), 0, '2.0b and it wrote nothing');

select pg_temp.act('a');
-- Evidence references are ids only: a key that looks like a name is refused.
select extensions.is((api.admin_football_mapping_propose(
  jsonb_build_array((pg_temp.item(41, 'F1') || jsonb_build_object('evidenceRefs', jsonb_build_array(jsonb_build_object('displayName', 'Someone')))) ),
  pg_temp.reason('F1'), gen_random_uuid()) -> 'proposals' -> 0 ->> 'code'), 'invalid_proposal',
  '2.1 an evidence reference with a name key is refused');

select pg_temp.put('r1', api.admin_football_mapping_propose(pg_temp.items('F1'), pg_temp.reason('F1'), gen_random_uuid())::text);
select pg_temp.put('r2', api.admin_football_mapping_propose(pg_temp.items('F2'), pg_temp.reason('F2'), gen_random_uuid())::text);
select extensions.is((select count(*)::int from jsonb_array_elements(pg_temp.get('r1')::jsonb -> 'proposals') p where (p ->> 'ok')::boolean), 20, '2.2 20 events rows proposed in one call');
select extensions.is((select count(*)::int from jsonb_array_elements(pg_temp.get('r2')::jsonb -> 'proposals') p where (p ->> 'ok')::boolean), 20, '2.3 20 shirt and birth date rows proposed in a second call');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where flashscore_candidate_id is not null and status = 'pending'), 40, '2.4 40 individual pending proposals');
select extensions.is((select count(distinct fingerprint)::int from app_private.football_player_mapping_proposals where flashscore_candidate_id is not null), 40, '2.5 each has its own fingerprint');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals p
  join frozen f on p.app_player_id = ('a1000000-0000-4000-8000-' || lpad(f.i::text, 12, '0'))::uuid where p.fingerprint = f.fp), 40,
  '2.6 EVERY proposal fingerprint equals the one the manifest computation gave it beforehand');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals p
  where p.flashscore_candidate_id is not null and app_private.football_mapping_row_fingerprint(p) = p.fingerprint), 40,
  '2.7 and the database recomputes the same value from the stored row');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where flashscore_candidate_id is not null
  and ((basis = 'incident' and reason = pg_temp.reason('F1')) or (basis = 'shirt_position' and reason = pg_temp.reason('F2')))), 40,
  '2.8 each carries its class wording and basis, and a Flashscore proposal never mentions a SportsMonks or Tier claim');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where flashscore_candidate_id is not null and (reason ~* 'sportsmonks|tier [ab]')), 0,
  '2.8b (the wording is checked, not assumed)');
select extensions.is((select count(*)::int from app_private.admin_audit_events where action = 'football.mapping_proposed') , 60 + 40, '2.9 one audit event per proposal');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name = 'flashscore'), 0, '2.10 PROPOSE maps nothing');

-- The backend's own holds: a position disagreement is parked for a note; the club mismatch is flagged.
select extensions.is((api.admin_football_mapping_propose(jsonb_build_array(pg_temp.item(61, 'F1')), pg_temp.reason('F1'), gen_random_uuid()) -> 'proposals' -> 0 ->> 'positionDisagreement')::boolean, true,
  '2.11 a position disagreement is parked by the backend for a note and an acknowledgement (so the batch carries no such row)');
select extensions.is((app_private.football_mapping_candidate_signals((select id from app_private.football_player_mapping_candidates where external_id = 'F62'),
  'a1000000-0000-4000-8000-000000000062'::uuid) ->> 'club'), 'mismatch', '2.12 a club the catalogue does not share is reported as a mismatch (so the batch carries no such row)');

-- Collisions the backend refuses, one item at a time, in one call.
select pg_temp.put('mix', api.admin_football_mapping_propose(jsonb_build_array(
  pg_temp.item(1, 'F1'),                                            -- candidate already has an open proposal
  jsonb_build_object('kind', 'map', 'flashscoreCandidateId', (select id from app_private.football_player_mapping_candidates where external_id = 'F41'),
    'appPlayerId', 'a1000000-0000-4000-8000-000000000001', 'basis', 'manual'),  -- target already held by an open proposal
  pg_temp.item(41, 'F2')),                                          -- a clean one
  pg_temp.reason('F2'), gen_random_uuid())::text);
select extensions.is(pg_temp.get('mix')::jsonb -> 'proposals' -> 0 ->> 'code', 'proposal_already_open', '2.13 an id with an open proposal is refused');
select extensions.is(pg_temp.get('mix')::jsonb -> 'proposals' -> 1 ->> 'code', 'identity_conflict', '2.14 a target an open proposal already holds is refused');
select extensions.is((pg_temp.get('mix')::jsonb -> 'proposals' -> 2 ->> 'ok')::boolean, true, '2.15 and the clean item in the same call is created: one failing row corrupts no other');
update app_private.football_player_mapping_proposals set status = 'cancelled' where flashscore_candidate_id in (select id from app_private.football_player_mapping_candidates where external_id in ('F41', 'F61')) and status in ('pending', 'position_disagreement');
select app_private.football_mapping_resync_candidate('flashscore', 'F41');
select app_private.football_mapping_resync_candidate('flashscore', 'F61');

-- ===========================================================================
-- 3. APPROVE one proposal at a time (single operator)
-- ===========================================================================
create temporary table decide_log (proposal_id uuid primary key, error text);
create function pg_temp.approve_batch() returns void language plpgsql as $$
declare p record;
begin
  perform pg_temp.act('a');
  for p in select id, fingerprint, reason from app_private.football_player_mapping_proposals
           where flashscore_candidate_id is not null and status = 'pending' and reason in (pg_temp.reason('F1'), pg_temp.reason('F2')) order by id loop
    begin
      perform api.admin_football_mapping_decide(p.id, 'approve',
        'Reviewed the frozen Flashscore batch evidence and confirmed the proposal still matches the approved manifest and its supporting reviewed Sofascore mapping.',
        p.fingerprint, false, gen_random_uuid());
      insert into decide_log values (p.id, null);
    exception when others then insert into decide_log values (p.id, sqlerrm);
    end;
  end loop;
end;
$$;
select pg_temp.approve_batch();
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where flashscore_candidate_id is not null and status = 'approved'), 40, '3.1 the 40 batch proposals are approved, each self-approved and logged');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name = 'flashscore'), 0, '3.2 APPROVE maps nothing');

-- ===========================================================================
-- 4. EXECUTE one at a time; the world moves mid-run; one bad row never corrupts the rest
-- ===========================================================================
-- Someone claims one TARGET for Flashscore and one Flashscore ID (by hand), after approval.
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
values ('flashscore', 'player', 'SOMEONE-ELSE', 'a1000000-0000-4000-8000-000000000005'::uuid, 'test', now());
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
values ('flashscore', 'player', 'F7', 'a1000000-0000-4000-8000-000000000063'::uuid, 'test', now());

create temporary table execute_log (proposal_id uuid primary key, outcome jsonb, error text);
create function pg_temp.execute_batch() returns void language plpgsql as $$
declare p record; v jsonb;
begin
  perform pg_temp.act('a');
  for p in select id from app_private.football_player_mapping_proposals where flashscore_candidate_id is not null and status = 'approved' order by id loop
    begin
      v := api.admin_football_mapping_execute(p.id, gen_random_uuid());
      insert into execute_log values (p.id, v, null);
    exception when others then insert into execute_log values (p.id, null, sqlerrm);
    end;
  end loop;
end;
$$;
select pg_temp.execute_batch();
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where flashscore_candidate_id is not null and status = 'executed'), 38,
  '4.1 38 execute: the two claimed rows (target taken, Flashscore id taken) never stop or undo the others');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where flashscore_candidate_id is not null and status = 'already_mapped'), 2,
  '4.2 and they are remembered as already_mapped, never retargeted or retried');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name = 'flashscore' and source_version like 'football_player_mapping:%'), 38,
  '4.3 exactly 38 reviewed Flashscore mapping rows exist, each from its own proposal');
select extensions.is((select count(*)::int from app_private.football_player_mapping_candidates where provider_name = 'flashscore' and status = 'mapped' and existing_mapping_id is not null), 38 + 1,
  '4.4 38 executed + the one candidate whose id someone else mapped are mapped; nobody else');
select extensions.is((select count(*)::int from app_private.admin_audit_events where action = 'football.mapping_executed'), 60 + 38, '4.5 one execution audit event per mapping');

-- ===========================================================================
-- 5. Invariance: nothing the batch is not about moved
-- ===========================================================================
select extensions.is((select md5(string_agg(m::text, ',' order by m.id)) from app_private.football_provider_mappings m where m.provider_name = 'sofascore'),
  pg_temp.get('sofa_digest'), '5.1 every Sofascore mapping row is byte-for-byte unchanged');
select extensions.is((select coalesce(jsonb_object_agg(k, 'changed'), '{}'::jsonb)::text from jsonb_each(pg_temp.world_parts()) e(k, v) where v is distinct from (pg_temp.get('world_parts')::jsonb -> k)), '{}',
  '5.2 (which part, if any, moved)');
select extensions.is(md5(pg_temp.world_parts()::text), md5(pg_temp.get('world_parts')),
  '5.3 players, team memberships, Fantasy tables, scoring snapshots, automation settings and cron jobs are unchanged: a Flashscore link moves no club, position, price, lineup or score');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name = 'sportsmonks'), 0, '5.4 no SportsMonks mapping appeared');

-- ===========================================================================
-- 6. What the client reads to re-check a supporting Sofascore mapping, and what the database does not check
-- ===========================================================================
-- A map proposal records the row(s) it wrote: this is the audit shape the client reads.
select extensions.is((select jsonb_typeof(executed_after -> 'rows') from app_private.football_player_mapping_proposals where sofascore_candidate_id = (select id from app_private.football_player_mapping_candidates where external_id = 'S50') and status = 'executed'), 'array',
  '6.1 an executed map proposal records the rows it wrote');
select extensions.is((select (executed_after -> 'rows' -> 0 ->> 'mappingId')::uuid from app_private.football_player_mapping_proposals where sofascore_candidate_id = (select id from app_private.football_player_mapping_candidates where external_id = 'S50') and status = 'executed'),
  (select id from app_private.football_provider_mappings where provider_name = 'sofascore' and external_id = 'S50'), '6.2 including the mapping row id');
select extensions.is((select source_version from app_private.football_provider_mappings where provider_name = 'sofascore' and external_id = 'S50'),
  'football_player_mapping:' || (select id::text from app_private.football_player_mapping_proposals where sofascore_candidate_id = (select id from app_private.football_player_mapping_candidates where external_id = 'S50') and status = 'executed'),
  '6.3 and the row carries the version stamp of the proposal that wrote it');

-- Deactivate one supporting mapping and retarget another, through the reviewed flow.
select pg_temp.act('a');
select pg_temp.put('off_mapping', (select id::text from app_private.football_provider_mappings where provider_name = 'sofascore' and external_id = 'S50'));
select pg_temp.put('re_mapping', (select id::text from app_private.football_provider_mappings where provider_name = 'sofascore' and external_id = 'S49'));
select pg_temp.put('off', api.admin_football_mapping_propose(jsonb_build_array(
  jsonb_build_object('kind', 'deactivate', 'providerName', 'sofascore', 'mappingId', pg_temp.get('off_mapping'))), 'Deactivate a supporting mapping for the test.', gen_random_uuid())::text);
select pg_temp.put('re', api.admin_football_mapping_propose(jsonb_build_array(
  jsonb_build_object('kind', 'replace', 'providerName', 'sofascore', 'mappingId', pg_temp.get('re_mapping'), 'newAppPlayerId', 'a1000000-0000-4000-8000-000000000061')), 'Retarget a supporting mapping for the test.', gen_random_uuid())::text);
select pg_temp.approve_and_execute_all();
select extensions.is((select (executed_after ->> 'active')::boolean from app_private.football_player_mapping_proposals where id = (pg_temp.get('off')::jsonb -> 'proposals' -> 0 ->> 'id')::uuid), false,
  '6.4 a deactivation records the row as it is afterwards (inactive), by mapping id');
select extensions.is((select executed_after ->> 'appPlayerId' from app_private.football_player_mapping_proposals where id = (pg_temp.get('re')::jsonb -> 'proposals' -> 0 ->> 'id')::uuid), 'a1000000-0000-4000-8000-000000000061',
  '6.5 a retarget records the new player');
select extensions.is((select status from app_private.football_player_mapping_candidates where provider_name = 'sofascore' and external_id = 'S50'), 'unmapped',
  '6.6 the Sofascore candidate reads "unmapped" once its mapping is inactive (the client reads exactly this)');
select extensions.is((select existing_mapping_id from app_private.football_player_mapping_candidates where provider_name = 'sofascore' and external_id = 'S50'), pg_temp.get('off_mapping')::uuid,
  '6.7 and still names the mapping row');
select extensions.is((select status from app_private.football_player_mapping_candidates where provider_name = 'sofascore' and external_id = 'S49'), 'mapped',
  '6.8 a retargeted mapping still reads "mapped": only the audit trail shows the new target (so the client reads the trail)');
select extensions.isnt((select source_version from app_private.football_provider_mappings where id = pg_temp.get('re_mapping')::uuid),
  'football_player_mapping:' || (select id::text from app_private.football_player_mapping_proposals where sofascore_candidate_id = (select id from app_private.football_player_mapping_candidates where external_id = 'S49') and kind = 'map' and status = 'executed'),
  '6.9 and the retargeted row carries a NEW version stamp');
-- The fact the client exists to cover: the database does not look at the supporting mapping when a Flashscore
-- proposal executes. F50's supporting mapping (S50) is inactive now; the proposal still goes through. (If a future
-- migration adds that check, this test should change with it.)
select pg_temp.act('a');
select pg_temp.put('f50', api.admin_football_mapping_propose(jsonb_build_array(pg_temp.item(50, 'F2')), pg_temp.reason('F2'), gen_random_uuid())::text);
select api.admin_football_mapping_decide((pg_temp.get('f50')::jsonb -> 'proposals' -> 0 ->> 'id')::uuid, 'approve', 'Approved for the test.',
  pg_temp.get('f50')::jsonb -> 'proposals' -> 0 ->> 'fingerprint', false, gen_random_uuid());
select api.admin_football_mapping_execute((pg_temp.get('f50')::jsonb -> 'proposals' -> 0 ->> 'id')::uuid, gen_random_uuid());
select extensions.is((select status from app_private.football_player_mapping_proposals where id = (pg_temp.get('f50')::jsonb -> 'proposals' -> 0 ->> 'id')::uuid), 'executed',
  '6.10 the database executes a Flashscore proposal whose supporting mapping is inactive: the client re-check is the only guard, which is why it exists');

-- ===========================================================================
-- 7. A session without the second factor or a recent sign-in changes nothing
-- ===========================================================================
select pg_temp.act('weak');
select extensions.throws_ok(
  format($f$select api.admin_football_mapping_propose(%L::jsonb, %L, gen_random_uuid())$f$, jsonb_build_array(pg_temp.item(42, 'F2')), pg_temp.reason('F2')),
  null, null, '7.1 a propose on an aal1 session is refused');
select pg_temp.act('a');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals where flashscore_candidate_id = (select id from app_private.football_player_mapping_candidates where external_id = 'F42')), 0,
  '7.2 and created no proposal');

select * from extensions.finish();
rollback;
