begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- The mapping workflow's behaviour (20261001161000): dual control for every
-- durable decision, the existing-row replacement model, shared Sofascore ids,
-- signals, held states, undo, retention. Sections are numbered in the comments.

-- ===========================================================================
-- Fixtures
-- ===========================================================================
create temporary table stash (k text primary key, v text);
create function pg_temp.put(p_key text, p_value text) returns void language sql as
  $$ insert into stash values (p_key, p_value) on conflict (k) do update set v = excluded.v $$;
create function pg_temp.get(p_key text) returns text language sql as
  $$ select v from stash where k = p_key $$;

-- People. a, b, c: three football operators on fresh aal2 sessions. aal1: an
-- operator whose session has no second factor. old: an operator whose session
-- is an hour old. nofb: staff with no football permission. fan: nobody.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('e1000000-0000-4000-8000-0000000000' || k)::uuid, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'map-' || k || '@example.test', 'hash', now(), '{}',
  ('{"username":"map_' || k || '"}')::jsonb, now(), now()
from (values ('a1'), ('b1'), ('c1'), ('d1'), ('e1'), ('f1'), ('91')) v(k);
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
select ('e3000000-0000-4000-8000-0000000000' || k)::uuid, ('e1000000-0000-4000-8000-0000000000' || k)::uuid,
  'TOTP ' || k, 'totp', 'verified', now(), now()
from (values ('a1'), ('b1'), ('c1'), ('d1'), ('e1'), ('91')) v(k);
insert into auth.sessions (id, user_id, created_at)
select ('e2000000-0000-4000-8000-0000000000' || k)::uuid, ('e1000000-0000-4000-8000-0000000000' || k)::uuid,
  case when k = 'e1' then now() - interval '1 hour' else now() end
from (values ('a1'), ('b1'), ('c1'), ('d1'), ('e1'), ('f1'), ('91')) v(k);
insert into app_private.staff_principals (auth_user_id)
select ('e1000000-0000-4000-8000-0000000000' || k)::uuid from (values ('a1'), ('b1'), ('c1'), ('d1'), ('e1'), ('91')) v(k);
insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select sp.id, r.id, 'Test operator for the mapping workflow.'
from app_private.staff_principals sp
join auth.users u on u.id = sp.auth_user_id
join app_private.admin_roles r on r.name = case when u.email = 'map-91@example.test' then 'support_agent' else 'football_operator' end
where u.email like 'map-%@example.test';

create function pg_temp.act(p_who text) returns void language plpgsql as $$
declare
  v_user text := case p_who when 'a' then 'a1' when 'b' then 'b1' when 'c' then 'c1' when 'aal1' then 'd1'
    when 'old' then 'e1' when 'fan' then 'f1' when 'nofb' then '91' end;
begin
  if p_who = 'svc' then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  else
    perform set_config('request.jwt.claims', format(
      '{"sub":"e1000000-0000-4000-8000-0000000000%s","role":"authenticated","aal":"%s","session_id":"e2000000-0000-4000-8000-0000000000%s"}',
      v_user, case when p_who = 'aal1' then 'aal1' else 'aal2' end, v_user), true);
  end if;
end;
$$;
create function pg_temp.pid(p_who text) returns uuid language sql as
  $$ select id from app_private.staff_principals where auth_user_id = ('e1000000-0000-4000-8000-0000000000' ||
     case p_who when 'a' then 'a1' when 'b' then 'b1' when 'c' then 'c1' end)::uuid $$;

-- A club, two squads' worth of app players.
insert into app.teams (id, slug, name, short_name) values
  ('e4000000-0000-4000-8000-000000000001', 'map-club-one', 'Map Club One', 'MC1'),
  ('e4000000-0000-4000-8000-000000000002', 'map-club-two', 'Map Club Two', 'MC2');
create function pg_temp.mkplayer(p_slug text, p_position app.football_position, p_dob date,
  p_team uuid default 'e4000000-0000-4000-8000-000000000001', p_shirt integer default null) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into app.players (id, slug, full_name, display_name, position)
  values (v_id, p_slug, 'Player ' || p_slug, 'Player ' || p_slug, p_position);
  if p_dob is not null then
    -- A date of birth only enters through the attribute resolver.
    perform app_private.record_player_attribute_observation(v_id, 'date_of_birth', p_dob::text, null,
      'provider', 'sportsmonks', 'mapping-test', '2026-09-01T00:00:00Z');
    perform app_private.resolve_player_attributes(array[v_id]);
  end if;
  if p_team is not null then
    insert into app.team_memberships (player_id, team_id, valid_from, shirt_number)
    values (v_id, p_team, '2026-07-01', p_shirt);
  end if;
  return v_id;
end;
$$;

-- One observation, as the read-only collector would report it.
create function pg_temp.obs(p_provider text, p_ext text, p_team text, p_extra jsonb default '{}') returns jsonb
language sql as $$
  select jsonb_build_object('provider', p_provider, 'externalPlayerId', p_ext, 'providerTeamId', p_team,
    'clubKey', 'club-' || lower(p_team), 'squadCompleteness', 'COMPLETE', 'dobState', 'missing',
    'registeredTeamDisagreement', false, 'displayName', 'Provider Name ' || p_ext) || p_extra $$;
create function pg_temp.record(p_obs jsonb) returns jsonb language plpgsql as $$
begin
  perform pg_temp.act('svc');
  return api.football_mapping_record_observations(jsonb_build_array(p_obs));
end;
$$;
create function pg_temp.cid(p_provider text, p_ext text) returns uuid language sql as
  $$ select id from app_private.football_player_mapping_candidates where provider_name = p_provider and external_id = p_ext $$;
create function pg_temp.cstatus(p_provider text, p_ext text) returns text language sql as
  $$ select status from app_private.football_player_mapping_candidates where provider_name = p_provider and external_id = p_ext $$;

create function pg_temp.propose(p_who text, p_items jsonb, p_reason text default 'Reviewed the evidence for this pairing.')
returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(p_who);
  return api.admin_football_mapping_propose(p_items, p_reason, gen_random_uuid());
end;
$$;
create function pg_temp.decide(p_who text, p_id uuid, p_decision text default 'approve', p_ack boolean default false,
  p_fingerprint text default null) returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(p_who);
  return api.admin_football_mapping_decide(p_id, p_decision, 'Checked the evidence independently.',
    coalesce(p_fingerprint, (select fingerprint from app_private.football_player_mapping_proposals where id = p_id)),
    p_ack, gen_random_uuid());
end;
$$;
create function pg_temp.execute(p_who text, p_id uuid) returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(p_who);
  return api.admin_football_mapping_execute(p_id, gen_random_uuid());
end;
$$;
create function pg_temp.pstatus(p_id uuid) returns text language sql as
  $$ select status from app_private.football_player_mapping_proposals where id = p_id $$;
-- Whole flow for set-up: a proposes, b approves, a executes. Returns the proposal id.
create function pg_temp.flow(p_item jsonb) returns uuid language plpgsql as $$
declare v_id uuid; v_res jsonb;
begin
  v_res := pg_temp.propose('a', jsonb_build_array(p_item));
  v_id := (v_res -> 'proposals' -> 0 ->> 'id')::uuid;
  if v_id is null then raise exception 'flow: proposal refused %', v_res; end if;
  perform pg_temp.decide('b', v_id);
  v_res := pg_temp.execute('a', v_id);
  if not (v_res ->> 'ok')::boolean then raise exception 'flow: execution refused %', v_res; end if;
  return v_id;
end;
$$;
create function pg_temp.mapping_digest(p_id uuid) returns text language sql as
  $$ select md5(m::text) from app_private.football_provider_mappings m where id = p_id $$;

-- ===========================================================================
-- 1. The builder: one provider id is ONE candidate, squads are observations
-- ===========================================================================
select pg_temp.record(pg_temp.obs('sofascore', 'S-MULTI', 'T-100', '{"shirtNumber":9,"positionSignal":"F"}'));
select pg_temp.record(pg_temp.obs('sofascore', 'S-MULTI', 'T-200', '{"shirtNumber":9,"positionSignal":"F","registeredTeamDisagreement":true,"registeredTeamId":"T-100"}'));

select extensions.is((select count(*)::int from app_private.football_player_mapping_candidates
  where provider_name = 'sofascore' and external_id = 'S-MULTI'), 1,
  '1.1 the same Sofascore id in two squads is ONE candidate');
select extensions.is((select count(*)::int from app_private.football_player_mapping_observations
  where candidate_id = pg_temp.cid('sofascore', 'S-MULTI')), 2,
  '1.2 and both squad observations are kept');
select pg_temp.act('a');
select extensions.ok((api.admin_football_mapping_get_candidate(pg_temp.cid('sofascore', 'S-MULTI')) -> 'flags') ? 'MULTI_SQUAD_OBSERVATION',
  '1.3 the candidate is flagged MULTI_SQUAD_OBSERVATION');
select extensions.ok(not ((api.admin_football_mapping_get_candidate(pg_temp.cid('sofascore', 'S-MULTI')) -> 'flags') ? 'DUPLICATE'),
  '1.4 and nothing calls it a duplicate, a transfer or a collision');
select extensions.is(pg_temp.cstatus('sofascore', 'S-MULTI'), 'unmapped',
  '1.5 a multi-squad observation does not change the status');

select pg_temp.record(pg_temp.obs('sofascore', 'S-MULTI', 'T-100', '{"shirtNumber":9,"positionSignal":"F"}'));
select extensions.is((select evidence_revision from app_private.football_player_mapping_candidates
  where id = pg_temp.cid('sofascore', 'S-MULTI')), 3,
  '1.6 re-recording identical observations leaves the evidence revision alone (it moved only while the two were first recorded)');
select pg_temp.record(pg_temp.obs('sofascore', 'S-MULTI', 'T-100', '{"shirtNumber":10,"positionSignal":"F"}'));
select extensions.is((select evidence_revision from app_private.football_player_mapping_candidates
  where id = pg_temp.cid('sofascore', 'S-MULTI')), 4, '1.7 a changed attribute bumps the revision');
select extensions.is((select count(*)::int from app_private.football_player_mapping_candidates), 1,
  '1.8 recording again made no second candidate');

select extensions.throws_ok($$select api.football_mapping_record_observations('[{"provider":"sportsmonks","externalPlayerId":"1","providerTeamId":"x"}]'::jsonb)$$,
  'PT400', 'invalid_observations', '1.9 the builder refuses a provider that is not Sofascore or Flashscore');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name in ('sofascore', 'flashscore')), 0,
  '1.10 recording observations wrote no mapping row');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals), 0,
  '1.11 and no proposal');

set local role service_role;
select extensions.throws_ok($$select count(*) from app_private.football_player_mapping_candidates$$, '42501', null,
  '1.12 even service_role cannot read the tables directly');
select extensions.lives_ok($$select api.football_mapping_expire_proposals()$$, '1.13 but it can run the trusted sweeper');
reset role;
set local role authenticated;
select extensions.throws_ok($$select api.football_mapping_record_observations('[]'::jsonb)$$, '42501', null,
  '1.14 a signed-in user cannot run the builder');
reset role;

-- ===========================================================================
-- 2. Authority: AAL2, recent authentication, permission
-- ===========================================================================
select pg_temp.record(pg_temp.obs('sofascore', 'S-AUTH', 'T-100'));
select pg_temp.mkplayer('auth-player', 'forward', null);
create function pg_temp.auth_item() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('kind', 'map',
    'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-AUTH'),
    'appPlayerId', (select id from app.players where slug = 'auth-player'))) $$;
select pg_temp.act('fan');
select extensions.throws_ok($$select api.admin_football_mapping_propose(pg_temp.auth_item(), 'Reason long enough.', gen_random_uuid())$$,
  'PT403', 'staff_access_denied', '2.1 a signed-in person who is not staff cannot propose');
select pg_temp.act('aal1');
select extensions.throws_ok($$select api.admin_football_mapping_propose(pg_temp.auth_item(), 'Reason long enough.', gen_random_uuid())$$,
  'PT403', 'mfa_assurance_insufficient', '2.2 staff on an aal1 session cannot propose (AAL2 required)');
select pg_temp.act('old');
select extensions.throws_ok($$select api.admin_football_mapping_propose(pg_temp.auth_item(), 'Reason long enough.', gen_random_uuid())$$,
  'PT403', 'recent_auth_required', '2.3 an operator whose session is an hour old cannot propose (recent authentication)');
select pg_temp.act('nofb');
select extensions.throws_ok($$select api.admin_football_mapping_propose(pg_temp.auth_item(), 'Reason long enough.', gen_random_uuid())$$,
  'PT403', 'permission_missing', '2.4 staff without football.manage_mappings cannot propose');
select extensions.throws_ok($$select api.admin_football_mapping_list_candidates()$$, 'PT403', 'permission_missing',
  '2.5 nor read the queue');
select pg_temp.act('a');
select extensions.throws_ok($$select api.admin_football_mapping_propose(pg_temp.auth_item(), 'short', gen_random_uuid())$$,
  'PT400', 'reason_required', '2.6 a reason is required (10 to 500 characters)');
select extensions.throws_ok($$select api.admin_football_mapping_propose('[]'::jsonb, 'Reason long enough.', gen_random_uuid())$$,
  'PT400', 'invalid_proposal', '2.7 an empty batch is refused');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals), 0,
  '2.8 none of those refusals left a proposal behind');

-- ===========================================================================
-- 3. Map: propose, a DIFFERENT human approves, execute. Two providers, one app player.
-- ===========================================================================
select pg_temp.mkplayer('happy-player', 'forward', '1998-05-14', 'e4000000-0000-4000-8000-000000000001', 9);
select pg_temp.record(pg_temp.obs('sofascore', 'S-HAPPY', 'T-100', jsonb_build_object(
  'dobState', 'valid', 'birthDate', '1998-05-14', 'shirtNumber', 9, 'positionSignal', 'F',
  'appTeamId', 'e4000000-0000-4000-8000-000000000001')));
select pg_temp.record(pg_temp.obs('flashscore', 'F-HAPPY', 'FT-1', jsonb_build_object(
  'dobState', 'not_provided', 'shirtNumber', 9, 'positionSignal', 'F')));
select pg_temp.put('happy', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map', 'basis', 'incident',
  'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-HAPPY'), 'flashscoreCandidateId', pg_temp.cid('flashscore', 'F-HAPPY'),
  'appPlayerId', (select id from app.players where slug = 'happy-player'))))) -> 'proposals' -> 0 ->> 'id');

select extensions.is(pg_temp.pstatus(pg_temp.get('happy')::uuid), 'pending', '3.1 a proposal waits for a second person');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name in ('sofascore', 'flashscore')), 0,
  '3.2 proposing wrote no mapping');
select extensions.is(pg_temp.cstatus('sofascore', 'S-HAPPY') || '/' || pg_temp.cstatus('flashscore', 'F-HAPPY'), 'proposed/proposed',
  '3.3 both candidates show as proposed');
select extensions.is((select signals -> 'sofascore' ->> 'dob' from app_private.football_player_mapping_proposals where id = pg_temp.get('happy')::uuid),
  'match', '3.4 two valid, equal dates of birth are a match signal');
select extensions.is((select position_disagreement from app_private.football_player_mapping_proposals where id = pg_temp.get('happy')::uuid),
  false, '3.5 agreeing positions raise no flag');

select extensions.throws_ok($$select pg_temp.decide('a', pg_temp.get('happy')::uuid)$$, 'PT403', 'self_approval_denied',
  '3.6 the proposer cannot approve their own proposal');
select extensions.throws_ok($$select pg_temp.decide('a', pg_temp.get('happy')::uuid, 'reject')$$, 'PT403', 'self_approval_denied',
  '3.7 nor reject it');
select extensions.throws_ok($$select pg_temp.execute('a', pg_temp.get('happy')::uuid)$$, 'PT409', 'proposal_not_approved',
  '3.8 nothing is executed before it is approved');
select extensions.throws_ok($$select pg_temp.decide('b', pg_temp.get('happy')::uuid, 'approve', false, repeat('0', 64))$$,
  'PT409', 'fingerprint_mismatch', '3.9 an approval of any other fingerprint is refused');
select extensions.throws_ok($$select pg_temp.decide('aal1', pg_temp.get('happy')::uuid)$$, 'PT403', 'mfa_assurance_insufficient',
  '3.10 the approver needs AAL2 too');
select extensions.throws_ok($$select pg_temp.decide('old', pg_temp.get('happy')::uuid)$$, 'PT403', 'recent_auth_required',
  '3.11 and recent authentication');
select extensions.throws_ok($$update app_private.football_player_mapping_proposals set decided_by = requested_by,
  decided_at = now(), decision_reason = 'Approving my own proposal.' where id = pg_temp.get('happy')::uuid$$,
  '23514', null, '3.12 the table itself refuses a self-approval, whatever calls it');

select extensions.is((pg_temp.decide('b', pg_temp.get('happy')::uuid) ->> 'status'), 'approved', '3.13 a different human approves the exact fingerprint');
select extensions.is((select count(*)::int from app_private.admin_audit_events where action = 'football.mapping_approved'
  and target_entity_id = pg_temp.get('happy')::uuid and actor_principal_id = pg_temp.pid('b')), 1,
  '3.14 the approval is in the append-only audit with the approver');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where provider_name in ('sofascore', 'flashscore')), 0,
  '3.15 approval alone maps nothing');
select pg_temp.act('b');
select extensions.is((pg_temp.execute('a', pg_temp.get('happy')::uuid) ->> 'ok')::boolean, true, '3.16 the proposer (or anyone qualified) executes after approval');
select extensions.is((select count(*)::int from app_private.football_provider_mappings
  where provider_name in ('sofascore', 'flashscore') and internal_entity_id = (select id from app.players where slug = 'happy-player')
    and active and manually_corrected and entity_type = 'player'
    and corrected_by = 'e1000000-0000-4000-8000-0000000000b1'), 2,
  '3.17 exactly two mapping rows exist, active, correction fields carrying the APPROVER');
select extensions.is(pg_temp.cstatus('sofascore', 'S-HAPPY') || '/' || pg_temp.cstatus('flashscore', 'F-HAPPY'), 'mapped/mapped',
  '3.18 both candidates are mapped');
select extensions.is((select count(*)::int from app_private.football_player_mapping_candidates
  where existing_mapping_id is not null and external_id in ('S-HAPPY', 'F-HAPPY')), 2, '3.19 and point at their mapping rows');
select extensions.throws_ok($$select api.admin_football_mapping_execute(pg_temp.get('happy')::uuid, gen_random_uuid())$$,
  'PT409', 'operation_already_executed', '3.20 a second execution with another key is refused');
select extensions.is((select executed_after -> 'rows' -> 0 ->> 'provider' from app_private.football_player_mapping_proposals
  where id = pg_temp.get('happy')::uuid) is not null, true, '3.21 the proposal keeps what was written');
select extensions.is((select count(*)::int from app_private.admin_audit_events where action = 'football.mapping_executed'
  and target_entity_id = pg_temp.get('happy')::uuid), 1, '3.22 and the execution is audited once');

-- idempotency: the same key replays the stored answer and writes nothing
select pg_temp.put('exec_key', gen_random_uuid()::text);
select pg_temp.record(pg_temp.obs('sofascore', 'S-IDEM', 'T-100'));
select pg_temp.mkplayer('idem-player', 'defender', '1996-06-06');
select pg_temp.put('idem', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map',
  'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-IDEM'), 'appPlayerId', (select id from app.players where slug = 'idem-player'))))
  -> 'proposals' -> 0 ->> 'id'));
select pg_temp.decide('b', pg_temp.get('idem')::uuid);
select pg_temp.act('a');
select api.admin_football_mapping_execute(pg_temp.get('idem')::uuid, pg_temp.get('exec_key')::uuid);
select extensions.is((api.admin_football_mapping_execute(pg_temp.get('idem')::uuid, pg_temp.get('exec_key')::uuid) ->> 'ok')::boolean, true,
  '3.23 the same idempotency key returns the stored answer');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where external_id = 'S-IDEM'), 1,
  '3.24 and wrote no second row');

-- ===========================================================================
-- 4. Shared ids: one candidate, one proposal, nothing negative
-- ===========================================================================
select pg_temp.mkplayer('shared-player', 'forward', '1992-02-02', 'e4000000-0000-4000-8000-000000000001', 20);
select pg_temp.record(pg_temp.obs('sofascore', 'S-SHARED', 'T-100', jsonb_build_object('dobState', 'valid', 'birthDate', '1992-02-02',
  'shirtNumber', 20, 'positionSignal', 'F', 'appTeamId', 'e4000000-0000-4000-8000-000000000001')));
select pg_temp.record(pg_temp.obs('sofascore', 'S-SHARED', 'T-200', jsonb_build_object('dobState', 'valid', 'birthDate', '1992-02-02',
  'shirtNumber', 20, 'positionSignal', 'F', 'appTeamId', 'e4000000-0000-4000-8000-000000000002', 'registeredTeamDisagreement', true)));
select pg_temp.put('shared', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map',
  'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-SHARED'), 'appPlayerId', (select id from app.players where slug = 'shared-player'))))
  -> 'proposals' -> 0 ->> 'id'));
select extensions.is(pg_temp.pstatus(pg_temp.get('shared')::uuid), 'pending',
  '4.1 a candidate seen under two clubs, one of them not the app player''s club, is still proposable (club mismatch alone rejects nothing)');
select extensions.ok((select signals -> 'sofascore' -> 'flags' from app_private.football_player_mapping_proposals
  where id = pg_temp.get('shared')::uuid) ? 'MULTI_SQUAD_OBSERVATION', '4.2 the proposal carries MULTI_SQUAD_OBSERVATION as information');
select extensions.is((select signals -> 'sofascore' ->> 'club' from app_private.football_player_mapping_proposals
  where id = pg_temp.get('shared')::uuid), 'match', '4.3 the club context is a match if ANY observed squad is the app player''s club');
select extensions.is((select signals -> 'sofascore' ->> 'dob' from app_private.football_player_mapping_proposals
  where id = pg_temp.get('shared')::uuid), 'match', '4.4 and the second observation costs the candidate nothing');
select extensions.is((pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map',
  'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-SHARED'), 'appPlayerId', (select id from app.players where slug = 'shared-player'))))
  -> 'proposals' -> 0 ->> 'code'), 'proposal_already_open', '4.5 a second proposal for the same provider id is refused');
select extensions.is((select count(*)::int from app_private.football_player_mapping_proposals
  where sofascore_candidate_id = pg_temp.cid('sofascore', 'S-SHARED')), 1, '4.6 so there is no duplicate mapping proposal');
select extensions.is((select count(*)::int from app_private.football_player_mapping_observations
  where candidate_id = pg_temp.cid('sofascore', 'S-SHARED')), 2, '4.7 both squad observations are still retained');

-- a club mismatch with NO matching squad at all: still a flag only
select pg_temp.mkplayer('elsewhere-player', 'midfielder', '1994-04-04', 'e4000000-0000-4000-8000-000000000002', 8);
select pg_temp.record(pg_temp.obs('sofascore', 'S-ELSE', 'T-100', jsonb_build_object('dobState', 'valid', 'birthDate', '1994-04-04',
  'shirtNumber', 8, 'positionSignal', 'M', 'appTeamId', 'e4000000-0000-4000-8000-000000000001')));
select pg_temp.put('else', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map',
  'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-ELSE'), 'appPlayerId', (select id from app.players where slug = 'elsewhere-player'))))
  -> 'proposals' -> 0 ->> 'id'));
select extensions.is((select signals -> 'sofascore' ->> 'club' from app_private.football_player_mapping_proposals where id = pg_temp.get('else')::uuid),
  'mismatch', '4.8 a club mismatch is reported');
select extensions.is(pg_temp.pstatus(pg_temp.get('else')::uuid), 'pending', '4.9 and does not hold, reject or lower the proposal');
select extensions.is((pg_temp.decide('b', pg_temp.get('else')::uuid) ->> 'status'), 'approved', '4.10 and it is approved on its merits');

-- conflicting human identity evidence blocks approval
select pg_temp.record(pg_temp.obs('sofascore', 'S-CONFLICT', 'T-100'));
select pg_temp.mkplayer('conflict-player', 'forward', '1990-09-09');
select pg_temp.put('conflict', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map',
  'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-CONFLICT'), 'appPlayerId', (select id from app.players where slug = 'conflict-player'))))
  -> 'proposals' -> 0 ->> 'id'));
select pg_temp.record(pg_temp.obs('sofascore', 'S-OTHER', 'T-100'));
select extensions.is((pg_temp.propose('c', jsonb_build_array(jsonb_build_object('kind', 'map',
  'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-OTHER'), 'appPlayerId', (select id from app.players where slug = 'conflict-player'))))
  -> 'proposals' -> 0 ->> 'code'), 'identity_conflict', '4.11 another human proposing the same app player for a different id is refused: identity_conflict');
-- an earlier ignore of the very id (another human's decision) arrives before the approval
update app_private.football_player_mapping_candidates set status = 'ignored' where id = pg_temp.cid('sofascore', 'S-CONFLICT');
select extensions.is((pg_temp.decide('b', pg_temp.get('conflict')::uuid) ->> 'code'), 'identity_conflict',
  '4.12 conflicting identity evidence blocks the approval');
select extensions.is(pg_temp.pstatus(pg_temp.get('conflict')::uuid), 'identity_conflict', '4.13 and the proposal is held as identity_conflict');
select extensions.throws_ok($$select pg_temp.decide('b', pg_temp.get('conflict')::uuid)$$, 'PT409', 'identity_conflict',
  '4.14 an identity_conflict proposal cannot be approved');
select extensions.throws_ok($$update app_private.football_player_mapping_proposals set status = 'pending' where id = pg_temp.get('conflict')::uuid$$,
  '42501', null, '4.15 and cannot be edited back');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where external_id = 'S-CONFLICT'), 0,
  '4.16 nothing was mapped');

-- ===========================================================================
-- 5. Signals: missing or unreliable data is NO SIGNAL
-- ===========================================================================
select extensions.is(app_private.football_mapping_dob_signal('1998-05-14', 'valid', '1998-05-14', false) ->> 'signal', 'match',
  '5.1 valid and equal: match');
select extensions.is(app_private.football_mapping_dob_signal('1998-05-14', 'valid', '1997-05-14', false) ->> 'signal', 'conflict',
  '5.2 valid and different: a conflict (shown, never a rejection)');
select extensions.is(app_private.football_mapping_dob_signal(null, 'valid', '1998-05-14', false) ->> 'signal', 'no_signal',
  '5.3 a missing app DOB is no signal');
select extensions.is(app_private.football_mapping_dob_signal('1999-01-01', 'valid', '1999-01-01', false) ->> 'signal', 'no_signal',
  '5.4 a 1 January app DOB is no signal even when the provider date is the same');
select extensions.is(app_private.football_mapping_dob_signal('1999-01-01', 'valid', '1995-07-07', false) ->> 'signal', 'no_signal',
  '5.5 and no conflict when it differs');
select extensions.is(app_private.football_mapping_dob_signal('1998-05-14', 'valid', '1999-01-01', true) ->> 'signal', 'no_signal',
  '5.6 a 1 January provider date is no signal too');
select extensions.is((select count(*)::int from (values ('missing'), ('not_provided'), ('unparseable'), ('future'),
  ('age_below_minimum'), ('age_above_maximum')) s(state)
  where app_private.football_mapping_dob_signal('1998-05-14', s.state, null, false) ->> 'signal' <> 'no_signal'), 0,
  '5.7 a missing, unparseable, future or implausible provider date is no signal, never a conflict');
select extensions.is(app_private.football_mapping_dob_signal('2020-01-02', 'valid', '2020-01-02', false) ->> 'signal', 'no_signal',
  '5.8 an app date implying an age under 15 is no signal');

select extensions.is(app_private.football_mapping_signal_score(
  '{"dob":"no_signal","dobReason":"app_missing","shirt":"no_signal","position":"no_signal","flags":["INCOMPLETE_PROVIDER_SQUAD","MULTI_SQUAD_OBSERVATION","REGISTERED_TEAM_DISAGREEMENT","CLUB_CONTEXT_MISMATCH"]}'::jsonb),
  0, '5.8b missing data, an incomplete squad, a multi-squad observation, a registered-team disagreement and a club mismatch all score exactly zero: nothing but a valid conflict can lower a rank');

-- Ranking: nobody is dropped; missing data never lowers a rank; position never filters.
select pg_temp.mkplayer('rank-match', 'forward', '1990-03-03', 'e4000000-0000-4000-8000-000000000001', 11);
select pg_temp.mkplayer('rank-nodob', 'forward', null, 'e4000000-0000-4000-8000-000000000001', 12);
select pg_temp.mkplayer('rank-jan1', 'forward', '1990-01-01', 'e4000000-0000-4000-8000-000000000001', 13);
select pg_temp.mkplayer('rank-conflict', 'forward', '1985-05-05', 'e4000000-0000-4000-8000-000000000001', 14);
select pg_temp.mkplayer('rank-keeper', 'goalkeeper', '1991-04-04', 'e4000000-0000-4000-8000-000000000001', 1);
select pg_temp.record(pg_temp.obs('sofascore', 'S-RANK', 'T-100', jsonb_build_object('dobState', 'valid', 'birthDate', '1990-03-03',
  'shirtNumber', 11, 'positionSignal', 'F')));
select pg_temp.act('a');
select extensions.is(jsonb_array_length(api.admin_football_mapping_app_player_options(pg_temp.cid('sofascore', 'S-RANK'),
  'e4000000-0000-4000-8000-000000000001')) >= 5, true, '5.9 every player of the club is listed: nobody is dropped');
select extensions.is((select o ->> 'displayName' from jsonb_array_elements(api.admin_football_mapping_app_player_options(
  pg_temp.cid('sofascore', 'S-RANK'), 'e4000000-0000-4000-8000-000000000001')) o
  where o ->> 'displayName' like '%rank-%' order by (o ->> 'score')::int desc, o ->> 'appPlayerId' limit 1),
  'Player rank-match', '5.10 the player agreeing on date of birth, shirt and position ranks first');
select extensions.is((select (o ->> 'score')::int from jsonb_array_elements(api.admin_football_mapping_app_player_options(
  pg_temp.cid('sofascore', 'S-RANK'), 'e4000000-0000-4000-8000-000000000001')) o where o ->> 'displayName' = 'Player rank-nodob')
  >= (select (o ->> 'score')::int from jsonb_array_elements(api.admin_football_mapping_app_player_options(
  pg_temp.cid('sofascore', 'S-RANK'), 'e4000000-0000-4000-8000-000000000001')) o where o ->> 'displayName' = 'Player rank-conflict'),
  true, '5.11 a player with no date of birth does not rank below one whose valid date conflicts');
select extensions.is((select o -> 'signals' ->> 'dob' from jsonb_array_elements(api.admin_football_mapping_app_player_options(
  pg_temp.cid('sofascore', 'S-RANK'), 'e4000000-0000-4000-8000-000000000001')) o where o ->> 'displayName' = 'Player rank-jan1'),
  'no_signal', '5.12 a 1 January app date gives no date signal in the list either');
select extensions.ok((select o -> 'signals' -> 'flags' from jsonb_array_elements(api.admin_football_mapping_app_player_options(
  pg_temp.cid('sofascore', 'S-RANK'), 'e4000000-0000-4000-8000-000000000001')) o where o ->> 'displayName' = 'Player rank-keeper') ? 'POSITION_DISAGREEMENT',
  '5.13 a position contradiction is a visible flag, and that player is still listed');

-- an incomplete provider squad: a flag, never a negative signal
select pg_temp.mkplayer('incomplete-player', 'defender', '1993-03-03', 'e4000000-0000-4000-8000-000000000001', 4);
select pg_temp.record(pg_temp.obs('flashscore', 'F-INCOMPLETE', 'FT-9', jsonb_build_object('squadCompleteness', 'INCOMPLETE_PROVIDER_SQUAD',
  'positionSignal', 'D', 'shirtNumber', 4)));
select pg_temp.put('incomplete', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map',
  'flashscoreCandidateId', pg_temp.cid('flashscore', 'F-INCOMPLETE'), 'appPlayerId', (select id from app.players where slug = 'incomplete-player'))))
  -> 'proposals' -> 0 ->> 'id'));
select extensions.ok((select signals -> 'flashscore' -> 'flags' from app_private.football_player_mapping_proposals
  where id = pg_temp.get('incomplete')::uuid) ? 'INCOMPLETE_PROVIDER_SQUAD', '5.14 a candidate from an incomplete squad is flagged');
select extensions.is(pg_temp.pstatus(pg_temp.get('incomplete')::uuid), 'pending', '5.15 and is still proposable and approvable');
select extensions.is(app_private.football_mapping_signal_score(
  app_private.football_mapping_candidate_signals(pg_temp.cid('flashscore', 'F-INCOMPLETE'), (select id from app.players where slug = 'incomplete-player'))),
  app_private.football_mapping_signal_score(jsonb_build_object('dob', 'no_signal', 'shirt', 'match', 'position', 'match')),
  '5.16 the incomplete squad costs it no rank (only agreement scores)');

-- ===========================================================================
-- 6. Position disagreement: a held state, never a rejection
-- ===========================================================================
select pg_temp.mkplayer('posdis-player', 'forward', '1997-07-07', 'e4000000-0000-4000-8000-000000000001', 17);
select pg_temp.record(pg_temp.obs('sofascore', 'S-POS', 'T-100', '{"positionSignal":"M","shirtNumber":17}'));
select pg_temp.record(pg_temp.obs('flashscore', 'F-POS', 'FT-1', '{"positionSignal":"F","shirtNumber":17}'));
select pg_temp.put('pos', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map', 'basis', 'incident',
  'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-POS'), 'flashscoreCandidateId', pg_temp.cid('flashscore', 'F-POS'),
  'appPlayerId', (select id from app.players where slug = 'posdis-player')))) -> 'proposals' -> 0 ->> 'id'));
select extensions.is(pg_temp.pstatus(pg_temp.get('pos')::uuid), 'position_disagreement',
  '6.1 the providers disagreeing on position holds the proposal for a human (it is not rejected)');
select extensions.throws_ok($$select pg_temp.decide('b', pg_temp.get('pos')::uuid, 'approve', true)$$, 'PT409', 'position_disagreement_unacknowledged',
  '6.2 it cannot be approved before the proposer adds a note');
select pg_temp.act('b');
select extensions.throws_ok($$select api.admin_football_mapping_add_position_note(pg_temp.get('pos')::uuid, 'Not mine to write this note.', gen_random_uuid())$$,
  'PT403', 'not_authorized', '6.3 only the proposer can add the note');
select pg_temp.act('a');
select extensions.throws_ok($$select api.admin_football_mapping_add_position_note(pg_temp.get('pos')::uuid, 'short', gen_random_uuid())$$,
  'PT400', 'note_required', '6.4 the note must say something (10 to 500 characters)');
select pg_temp.put('pos_fp_before', (select fingerprint from app_private.football_player_mapping_proposals where id = pg_temp.get('pos')::uuid));
select api.admin_football_mapping_add_position_note(pg_temp.get('pos')::uuid,
  'Sofascore lists him as a midfielder; both providers attribute the same goals to him in two matches.', gen_random_uuid());
select extensions.is(pg_temp.pstatus(pg_temp.get('pos')::uuid), 'pending', '6.5 with the note the proposal returns to pending');
select extensions.isnt((select fingerprint from app_private.football_player_mapping_proposals where id = pg_temp.get('pos')::uuid),
  pg_temp.get('pos_fp_before'), '6.6 the note is part of the fingerprint');
select extensions.throws_ok($$select pg_temp.decide('b', pg_temp.get('pos')::uuid, 'approve', false)$$, 'PT409', 'position_disagreement_unacknowledged',
  '6.7 the approver must acknowledge the disagreement explicitly');
select extensions.is((pg_temp.decide('b', pg_temp.get('pos')::uuid, 'approve', true) ->> 'status'), 'approved',
  '6.8 with the acknowledgement it is approved');
select extensions.is((select position_disagreement_acknowledged from app_private.football_player_mapping_proposals where id = pg_temp.get('pos')::uuid),
  true, '6.9 and the acknowledgement is recorded');
select extensions.is((pg_temp.execute('a', pg_temp.get('pos')::uuid) ->> 'ok')::boolean, true, '6.10 and it executes: position never hard-rejected the pairing');

-- ===========================================================================
-- 7. Replacement model: UPDATE the existing row, never insert a second one
-- ===========================================================================
select pg_temp.mkplayer('rep-a', 'forward', '1990-10-10');
select pg_temp.mkplayer('rep-b', 'forward', '1991-11-11');
select pg_temp.mkplayer('rep-c', 'forward', '1992-12-12');
select pg_temp.mkplayer('rep-d', 'forward', '1993-12-13');
select pg_temp.record(pg_temp.obs('sofascore', 'S-REP1', 'T-100'));
select pg_temp.record(pg_temp.obs('sofascore', 'S-REP2', 'T-100'));
select pg_temp.record(pg_temp.obs('sofascore', 'S-REP3', 'T-100'));
select pg_temp.flow(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-REP1'),
  'appPlayerId', (select id from app.players where slug = 'rep-a')));
select pg_temp.flow(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-REP2'),
  'appPlayerId', (select id from app.players where slug = 'rep-b')));
select pg_temp.put('row1', (select id::text from app_private.football_provider_mappings where provider_name = 'sofascore' and external_id = 'S-REP1'));
select pg_temp.put('row2', (select id::text from app_private.football_provider_mappings where provider_name = 'sofascore' and external_id = 'S-REP2'));
select pg_temp.put('count_before', (select count(*)::text from app_private.football_provider_mappings));

create function pg_temp.rep(p_row text, p_new_ext text default null, p_new_player text default null) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'replace', 'providerName', 'sofascore', 'mappingId', pg_temp.get(p_row)::uuid,
    'newExternalId', p_new_ext, 'newAppPlayerId', case when p_new_player is null then null
      else (select id from app.players where slug = p_new_player) end) $$;

-- 7.1 replace the app player; the provider id stays
select pg_temp.put('rep1', pg_temp.flow(pg_temp.rep('row1', null, 'rep-c'))::text);
select extensions.is((select internal_entity_id from app_private.football_provider_mappings where id = pg_temp.get('row1')::uuid),
  (select id from app.players where slug = 'rep-c'), '7.1 replacing the app player updates internal_entity_id on the same row');
select extensions.is((select external_id from app_private.football_provider_mappings where id = pg_temp.get('row1')::uuid), 'S-REP1',
  '7.1b the provider id stays');
select extensions.is((select count(*)::text from app_private.football_provider_mappings), pg_temp.get('count_before'),
  '7.1c and no second row was inserted');

-- 7.2 replace the provider id; the app player stays
select pg_temp.flow(pg_temp.rep('row1', 'S-REP1-FIXED', null));
select extensions.is((select external_id || '/' || internal_entity_id::text from app_private.football_provider_mappings where id = pg_temp.get('row1')::uuid),
  'S-REP1-FIXED/' || (select id::text from app.players where slug = 'rep-c'), '7.2 replacing the provider id updates external_id on the same row, the app player stays');
select extensions.is((select count(*)::text from app_private.football_provider_mappings), pg_temp.get('count_before'), '7.2b still no second row');

-- 7.3 both at once
select pg_temp.flow(pg_temp.rep('row1', 'S-REP1-BOTH', 'rep-d'));
select extensions.is((select external_id || '/' || internal_entity_id::text from app_private.football_provider_mappings where id = pg_temp.get('row1')::uuid),
  'S-REP1-BOTH/' || (select id::text from app.players where slug = 'rep-d'), '7.3 both columns change atomically in one transaction');

-- 7.4 / 7.5 targets held by another row are refused, nothing written
select extensions.is((pg_temp.propose('a', jsonb_build_array(pg_temp.rep('row1', 'S-REP2', null))) -> 'proposals' -> 0 ->> 'code'),
  'already_mapped', '7.4 a new provider id held by another row is refused (already_mapped)');
select extensions.is((pg_temp.propose('a', jsonb_build_array(pg_temp.rep('row1', null, 'rep-b'))) -> 'proposals' -> 0 ->> 'code'),
  'already_mapped', '7.5 a new app player held by another row is refused (already_mapped)');
select extensions.is((select count(*)::text from app_private.football_provider_mappings), pg_temp.get('count_before'), '7.5b nothing was written');

-- 7.7 self-approval refused for replace, deactivate, reactivate
select pg_temp.put('self_rep', (pg_temp.propose('a', jsonb_build_array(pg_temp.rep('row2', null, 'rep-c'))) -> 'proposals' -> 0 ->> 'id'));
select extensions.throws_ok($$select pg_temp.decide('a', pg_temp.get('self_rep')::uuid)$$, 'PT403', 'self_approval_denied', '7.7 self-approval is refused for replace');
select pg_temp.act('a');
select api.admin_football_mapping_cancel(pg_temp.get('self_rep')::uuid, 'Withdrawn to test the next kind.', gen_random_uuid());
select pg_temp.put('self_deact', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'deactivate', 'providerName', 'sofascore',
  'mappingId', pg_temp.get('row2')::uuid))) -> 'proposals' -> 0 ->> 'id'));
select extensions.throws_ok($$select pg_temp.decide('a', pg_temp.get('self_deact')::uuid)$$, 'PT403', 'self_approval_denied', '7.7b and for deactivate');
select pg_temp.decide('b', pg_temp.get('self_deact')::uuid);

-- 7.6 deactivation then a reviewed reactivation reuses the same row
select extensions.is((pg_temp.execute('a', pg_temp.get('self_deact')::uuid) ->> 'ok')::boolean, true, '7.6 an approved deactivation executes');
select extensions.is((select active from app_private.football_provider_mappings where id = pg_temp.get('row2')::uuid), false,
  '7.6b it sets active = false on the existing row');
select extensions.is((select external_id from app_private.football_provider_mappings where id = pg_temp.get('row2')::uuid), 'S-REP2',
  '7.6c which keeps its provider id');
select extensions.is(pg_temp.cstatus('sofascore', 'S-REP2'), 'unmapped', '7.6d the candidate returns to unmapped');
select extensions.is((select existing_mapping_id from app_private.football_player_mapping_candidates where id = pg_temp.cid('sofascore', 'S-REP2')),
  pg_temp.get('row2')::uuid, '7.6e with existing_mapping_id pointing at the row that still holds the identity');
select extensions.is((pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-REP2'),
  'appPlayerId', (select id from app.players where slug = 'rep-b')))) -> 'proposals' -> 0 ->> 'code'), 'already_mapped',
  '7.8 a map for an identity held by an inactive row is refused');
select pg_temp.put('react', pg_temp.flow(jsonb_build_object('kind', 'reactivate', 'providerName', 'sofascore', 'mappingId', pg_temp.get('row2')::uuid))::text);
select extensions.is((select active from app_private.football_provider_mappings where id = pg_temp.get('row2')::uuid), true,
  '7.9 a reviewed reactivation reuses the same row (same id)');
select extensions.is((select count(*)::text from app_private.football_provider_mappings), pg_temp.get('count_before'),
  '7.9b and still no second row: the unique constraints never fired');
select extensions.is(pg_temp.cstatus('sofascore', 'S-REP2'), 'mapped', '7.9c the candidate is mapped again');

-- 7.10 audit before/after, and it is not derived from the mutable row
select extensions.is((select executed_before ->> 'externalId' || '>' || (executed_after ->> 'externalId')
  from app_private.football_player_mapping_proposals where id = pg_temp.get('rep1')::uuid), 'S-REP1>S-REP1',
  '7.10 the proposal keeps the exact before and after of the replacement');
select extensions.is((select (executed_before ->> 'appPlayerId') <> (executed_after ->> 'appPlayerId')
  from app_private.football_player_mapping_proposals where id = pg_temp.get('rep1')::uuid), true, '7.10b including the app player change');
select extensions.is((select safe_before ->> 'mappingId' = pg_temp.get('row1') and safe_after -> 'after' ->> 'mappingId' = pg_temp.get('row1')
    and (safe_after ->> 'requestedBy')::uuid = pg_temp.pid('a') and (safe_after ->> 'decidedBy')::uuid = pg_temp.pid('b')
    and safe_after ->> 'reason' is not null and safe_after ->> 'fingerprint' ~ '^[a-f0-9]{64}$'
  from app_private.admin_audit_events where action = 'football.mapping_executed' and target_entity_id = pg_temp.get('rep1')::uuid),
  true, '7.10c the audit event carries row id, proposer, approver, reason, fingerprint and the before/after');
update app_private.football_provider_mappings set external_id = 'S-REP1-LATER' where id = pg_temp.get('row1')::uuid;
select extensions.is((select safe_before ->> 'externalId' from app_private.admin_audit_events
  where action = 'football.mapping_executed' and target_entity_id = pg_temp.get('rep1')::uuid), 'S-REP1',
  '7.10d the history does not move when the mutable row is edited later');
update app_private.football_provider_mappings set external_id = 'S-REP1-BOTH' where id = pg_temp.get('row1')::uuid;

-- 7.9 a failed execution leaves the row byte-identical
select pg_temp.mkplayer('late-target', 'forward', '1989-09-19');
select pg_temp.put('fail', (pg_temp.propose('a', jsonb_build_array(pg_temp.rep('row2', null, 'late-target'))) -> 'proposals' -> 0 ->> 'id'));
select pg_temp.decide('b', pg_temp.get('fail')::uuid);
select pg_temp.record(pg_temp.obs('sofascore', 'S-GRAB', 'T-100'));
-- someone else's mapping now holds the new app player for Sofascore
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
values ('sofascore', 'player', 'S-GRAB', (select id from app.players where slug = 'late-target'), 'test', now());
select pg_temp.put('digest_before', pg_temp.mapping_digest(pg_temp.get('row2')::uuid));
select extensions.is((pg_temp.execute('a', pg_temp.get('fail')::uuid) ->> 'code'), 'already_mapped', '7.11 a replacement whose target was taken after approval is refused at execution');
select extensions.is(pg_temp.mapping_digest(pg_temp.get('row2')::uuid), pg_temp.get('digest_before'),
  '7.12 and the original mapping row is byte-identical');
select extensions.is(pg_temp.pstatus(pg_temp.get('fail')::uuid), 'already_mapped', '7.13 the proposal records why (already_mapped, final)');

-- stale: the row changed since the proposal
select pg_temp.put('stale_row', (pg_temp.propose('a', jsonb_build_array(pg_temp.rep('row2', null, 'rep-a'))) -> 'proposals' -> 0 ->> 'id'));
update app_private.football_provider_mappings set last_seen_at = now(), source_version = 'changed' where id = pg_temp.get('row2')::uuid;
update app_private.football_provider_mappings set active = false where id = pg_temp.get('row2')::uuid;
select extensions.is((pg_temp.decide('b', pg_temp.get('stale_row')::uuid) ->> 'code'), 'mapping_not_active',
  '7.15 a row that changed since the proposal is refused at approval');
select extensions.is(pg_temp.pstatus(pg_temp.get('stale_row')::uuid), 'stale_evidence', '7.16 and the proposal is held as stale_evidence');
update app_private.football_provider_mappings set active = true where id = pg_temp.get('row2')::uuid;

-- the function can touch nothing but player rows of the two new providers
select pg_temp.mkplayer('sm-player', 'forward', '1988-08-08');
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
values ('sportsmonks', 'player', 'SM-1', (select id from app.players where slug = 'sm-player'), 'test', now());
select extensions.is((pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'deactivate', 'providerName', 'sportsmonks',
  'mappingId', (select id from app_private.football_provider_mappings where external_id = 'SM-1')))) -> 'proposals' -> 0 ->> 'code'),
  'mapping_not_found', '7.17 a sportsmonks mapping can never be proposed for change');

-- ===========================================================================
-- 8. Stale evidence: an approval never carries over a change
-- ===========================================================================
select pg_temp.mkplayer('stale-player', 'forward', '1996-01-02', 'e4000000-0000-4000-8000-000000000001', 30);
select pg_temp.record(pg_temp.obs('sofascore', 'S-STALE', 'T-100', '{"shirtNumber":30,"positionSignal":"F"}'));
select pg_temp.put('stale', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map',
  'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-STALE'), 'appPlayerId', (select id from app.players where slug = 'stale-player'))))
  -> 'proposals' -> 0 ->> 'id'));
select pg_temp.put('stale_fp', (select fingerprint from app_private.football_player_mapping_proposals where id = pg_temp.get('stale')::uuid));
select pg_temp.decide('b', pg_temp.get('stale')::uuid);
select extensions.is(pg_temp.pstatus(pg_temp.get('stale')::uuid), 'approved', '8.1 approved');
select pg_temp.record(pg_temp.obs('sofascore', 'S-STALE', 'T-100', '{"shirtNumber":31,"positionSignal":"F"}'));
select extensions.is((pg_temp.execute('a', pg_temp.get('stale')::uuid) ->> 'code'), 'stale_evidence',
  '8.2 the provider evidence moved after approval: execution is refused');
select extensions.is(pg_temp.pstatus(pg_temp.get('stale')::uuid), 'stale_evidence', '8.3 the proposal is held as stale_evidence');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where external_id = 'S-STALE'), 0, '8.4 nothing was written');
select pg_temp.act('b');
select extensions.throws_ok($$select api.admin_football_mapping_refresh_evidence(pg_temp.get('stale')::uuid, gen_random_uuid())$$, 'PT403', 'not_authorized',
  '8.5 only the proposer refreshes the evidence');
select pg_temp.act('a');
select api.admin_football_mapping_refresh_evidence(pg_temp.get('stale')::uuid, gen_random_uuid());
select extensions.is(pg_temp.pstatus(pg_temp.get('stale')::uuid), 'pending', '8.6 a refresh returns it to pending');
select extensions.isnt((select fingerprint from app_private.football_player_mapping_proposals where id = pg_temp.get('stale')::uuid),
  pg_temp.get('stale_fp'), '8.7 with a new fingerprint');
select extensions.is((select decided_by from app_private.football_player_mapping_proposals where id = pg_temp.get('stale')::uuid), null,
  '8.8 and the earlier approval is gone');
select extensions.throws_ok($$select pg_temp.decide('b', pg_temp.get('stale')::uuid, 'approve', false, pg_temp.get('stale_fp'))$$,
  'PT409', 'fingerprint_mismatch', '8.9 approving the OLD fingerprint is refused');
select pg_temp.decide('b', pg_temp.get('stale')::uuid);
select extensions.is((pg_temp.execute('a', pg_temp.get('stale')::uuid) ->> 'ok')::boolean, true, '8.10 the new approval executes');
select extensions.throws_ok($$update app_private.football_player_mapping_proposals set fingerprint = repeat('a', 64) where id = pg_temp.get('conflict')::uuid$$,
  '42501', null, '8.11 a fingerprint cannot be edited in place');

-- ===========================================================================
-- 9. Ignore / reverse ignore ("not a Botola player"), under the same rule
-- ===========================================================================
select pg_temp.record(pg_temp.obs('sofascore', 'S-IGN', 'T-100'));
select pg_temp.record(pg_temp.obs('sofascore', 'S-INLINEUP', 'T-100', '{"seenInLineupOrIncident":true}'));
select extensions.is((pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'ignore',
  'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-INLINEUP')))) -> 'proposals' -> 0 ->> 'code'), 'ignore_refused_id_in_lineup',
  '9.1 an id that appears in a lineup or incident can never be ignored');
select pg_temp.put('ign', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'ignore',
  'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-IGN')))) -> 'proposals' -> 0 ->> 'id'));
select extensions.throws_ok($$select pg_temp.decide('a', pg_temp.get('ign')::uuid)$$, 'PT403', 'self_approval_denied', '9.2 self-approval is refused for ignore');
select extensions.is(pg_temp.cstatus('sofascore', 'S-IGN'), 'proposed', '9.3 an open ignore proposal shows the candidate as proposed');
select pg_temp.decide('b', pg_temp.get('ign')::uuid);
select extensions.is(pg_temp.cstatus('sofascore', 'S-IGN'), 'proposed', '9.4 an approved ignore changes nothing yet');
select pg_temp.execute('a', pg_temp.get('ign')::uuid);
select extensions.is(pg_temp.cstatus('sofascore', 'S-IGN'), 'ignored', '9.5 an executed ignore marks the candidate ignored');
select extensions.is((pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-IGN'),
  'appPlayerId', (select id from app.players where slug = 'rep-a')))) -> 'proposals' -> 0 ->> 'code'), 'identity_conflict',
  '9.6 an ignored id cannot be proposed for mapping');
select pg_temp.put('rev', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'reverse_ignore',
  'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-IGN')))) -> 'proposals' -> 0 ->> 'id'));
select extensions.is(pg_temp.cstatus('sofascore', 'S-IGN'), 'ignored', '9.7 an open reverse proposal does not unmark it');
select extensions.throws_ok($$select pg_temp.decide('a', pg_temp.get('rev')::uuid)$$, 'PT403', 'self_approval_denied', '9.8 self-approval is refused for reverse_ignore');
select pg_temp.decide('c', pg_temp.get('rev')::uuid);
select pg_temp.execute('b', pg_temp.get('rev')::uuid);
select extensions.is(pg_temp.cstatus('sofascore', 'S-IGN'), 'unmapped', '9.9 a reviewed reverse returns it to unmapped');
select extensions.is((select count(*)::int from app_private.football_player_mapping_candidates where external_id = 'S-IGN'), 1,
  '9.10 and nothing was deleted: the candidate is the same row');

-- ===========================================================================
-- 10. Cancel, reject, expiry
-- ===========================================================================
select pg_temp.record(pg_temp.obs('sofascore', 'S-CANCEL', 'T-100'));
select pg_temp.mkplayer('cancel-player', 'forward', '1987-07-17');
select pg_temp.put('cancel', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-CANCEL'),
  'appPlayerId', (select id from app.players where slug = 'cancel-player')))) -> 'proposals' -> 0 ->> 'id'));
select pg_temp.act('b');
select extensions.throws_ok($$select api.admin_football_mapping_cancel(pg_temp.get('cancel')::uuid, 'Not the proposer to cancel.', gen_random_uuid())$$,
  'PT403', 'not_authorized', '10.1 only the proposer can cancel');
select pg_temp.act('a');
select api.admin_football_mapping_cancel(pg_temp.get('cancel')::uuid, 'Withdrawn, the evidence was thin.', gen_random_uuid());
select extensions.is(pg_temp.pstatus(pg_temp.get('cancel')::uuid), 'cancelled', '10.2 a cancelled proposal is final');
select extensions.is(pg_temp.cstatus('sofascore', 'S-CANCEL'), 'unmapped', '10.3 and gives its candidate back');
select extensions.throws_ok($$update app_private.football_player_mapping_proposals set status = 'pending' where id = pg_temp.get('cancel')::uuid$$,
  '42501', null, '10.4 a final proposal cannot be reopened');

select pg_temp.put('reject', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-CANCEL'),
  'appPlayerId', (select id from app.players where slug = 'cancel-player')))) -> 'proposals' -> 0 ->> 'id'));
select pg_temp.decide('b', pg_temp.get('reject')::uuid, 'reject');
select extensions.is(pg_temp.pstatus(pg_temp.get('reject')::uuid), 'rejected', '10.5 a different human can reject');
select extensions.is(pg_temp.cstatus('sofascore', 'S-CANCEL'), 'unmapped', '10.6 which also gives the candidate back');
select extensions.throws_ok($$select pg_temp.execute('a', pg_temp.get('reject')::uuid)$$, 'PT409', 'proposal_not_approved', '10.7 a rejected proposal cannot execute');

select pg_temp.put('expire', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-CANCEL'),
  'appPlayerId', (select id from app.players where slug = 'cancel-player')))) -> 'proposals' -> 0 ->> 'id'));
-- time passes: only the refresh path may rewrite an expiry, so simulate it as the owner would
alter table app_private.football_player_mapping_proposals disable trigger football_player_mapping_proposals_guard;
update app_private.football_player_mapping_proposals set expires_at = now() - interval '1 minute',
  requested_at = now() - interval '73 hours' where id = pg_temp.get('expire')::uuid;
alter table app_private.football_player_mapping_proposals enable trigger football_player_mapping_proposals_guard;
select extensions.throws_ok($$select pg_temp.decide('b', pg_temp.get('expire')::uuid)$$, 'PT409', 'proposal_expired', '10.8 an expired proposal cannot be approved');
select pg_temp.act('svc');
select extensions.is(api.football_mapping_expire_proposals(), 1, '10.9 the sweeper expires it');
select extensions.is(pg_temp.pstatus(pg_temp.get('expire')::uuid), 'expired', '10.10 as a final state');
select extensions.is(pg_temp.cstatus('sofascore', 'S-CANCEL'), 'unmapped', '10.11 and gives the candidate back');
select extensions.is((select count(*)::int from app_private.admin_audit_events where action = 'football.mapping_expired'), 1, '10.12 with an audit event');

-- 10b. Authority is re-checked at execution, and an approval does not keep
select pg_temp.record(pg_temp.obs('sofascore', 'S-AUTHZ', 'T-100'));
select pg_temp.mkplayer('authz-player', 'forward', '1984-04-14');
select pg_temp.put('authz', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-AUTHZ'),
  'appPlayerId', (select id from app.players where slug = 'authz-player')))) -> 'proposals' -> 0 ->> 'id'));
select pg_temp.decide('c', pg_temp.get('authz')::uuid);
update app_private.staff_principals set status = 'suspended', suspended_at = now(), suspension_reason = 'Suspended after approving, for the test.',
  suspended_by_principal_id = pg_temp.pid('a') where id = pg_temp.pid('c');
select extensions.throws_ok($$select pg_temp.execute('a', pg_temp.get('authz')::uuid)$$, 'PT409', 'approver_no_longer_qualified',
  '10.13 an approval by someone no longer qualified cannot be executed');
update app_private.staff_principals set status = 'active', suspended_at = null, suspension_reason = null, suspended_by_principal_id = null
  where id = pg_temp.pid('c');
update app_private.football_player_mapping_proposals set decided_at = now() - interval '25 hours' where id = pg_temp.get('authz')::uuid;
select extensions.throws_ok($$select pg_temp.execute('a', pg_temp.get('authz')::uuid)$$, 'PT409', 'approval_expired',
  '10.14 an approval older than 24 hours cannot be executed');
select extensions.is((select count(*)::int from app_private.football_provider_mappings where external_id = 'S-AUTHZ'), 0,
  '10.15 and neither refusal wrote anything');
update app_private.football_player_mapping_proposals set decided_at = now() where id = pg_temp.get('authz')::uuid;
select extensions.is((pg_temp.execute('b', pg_temp.get('authz')::uuid) ->> 'ok')::boolean, true,
  '10.16 a fresh approval by a qualified approver executes (here run by a third person)');

-- ===========================================================================
-- 11. Immutability: the ledger
-- ===========================================================================
select extensions.throws_ok($$delete from app_private.football_player_mapping_proposals$$, '42501', null, '11.1 a proposal is never deleted');
select extensions.throws_ok($$delete from app_private.football_player_mapping_candidates$$, '42501', null, '11.2 nor a candidate');
select extensions.throws_ok($$delete from app_private.football_player_mapping_observations$$, '42501', null, '11.3 nor an observation');
select extensions.throws_ok($$truncate app_private.football_player_mapping_proposals$$, '42501', null, '11.4 nor truncated');
select extensions.throws_ok($$update app_private.football_player_mapping_proposals set app_player_id = null where id = pg_temp.get('happy')::uuid$$,
  '42501', null, '11.5 an executed proposal is immutable');
select extensions.throws_ok($$update app_private.football_player_mapping_proposals set reason = 'A rewritten reason for the past.' where id = pg_temp.get('self_deact')::uuid$$,
  '42501', null, '11.6 and so is the payload of a live one (here an executed deactivation)');
select extensions.throws_ok($$update app_private.football_player_mapping_proposals set hold_code = 'tamper' where id = pg_temp.get('reject')::uuid$$,
  '42501', null, '11.6b a rejected proposal cannot be touched at all');
select extensions.throws_ok($$update app_private.football_player_mapping_proposals set app_player_id = (select id from app.players where slug = 'rep-a')
  where id = pg_temp.get('incomplete')::uuid$$, '42501', null, '11.6c the app player of a live proposal cannot be changed');
select extensions.throws_ok($$update app_private.football_player_mapping_proposals set flashscore_external_id = 'other'
  where id = pg_temp.get('incomplete')::uuid$$, '42501', null, '11.6d nor its provider id');
select extensions.throws_ok($$update app_private.football_player_mapping_proposals set signals = '{}'::jsonb
  where id = pg_temp.get('incomplete')::uuid$$, '42501', null, '11.6e nor the evidence the approver saw');
select extensions.throws_ok($$update app_private.football_player_mapping_candidates set external_id = 'changed' where external_id = 'S-IGN'$$,
  '42501', null, '11.7 a candidate''s provider identity never changes');
select extensions.throws_ok($$update app_private.admin_audit_events set reason = 'rewritten history for the audit' where action = 'football.mapping_executed'$$,
  '42501', null, '11.8 the audit events are append-only');
select extensions.throws_ok($$insert into app_private.football_player_mapping_proposals (batch_id, kind, sofascore_candidate_id, sofascore_external_id,
  app_player_id, reason, requested_by, fingerprint, evidence)
  select gen_random_uuid(), 'map', c.id, c.external_id, (select id from app.players limit 1), 'A reason long enough here.',
    (select id from app_private.staff_principals limit 1), repeat('a', 64), '{"displayName":"Somebody"}'::jsonb
  from app_private.football_player_mapping_candidates c limit 1$$, '23514', null,
  '11.9 evidence that names a person is refused by the table');
select extensions.throws_ok($$insert into app_private.football_player_mapping_proposals (batch_id, kind, app_player_id, reason, requested_by, fingerprint)
  values (gen_random_uuid(), 'map', (select id from app.players limit 1), 'A reason long enough here.',
    (select id from app_private.staff_principals limit 1), repeat('a', 64))$$, '23514', null,
  '11.10 a map proposal that names no provider candidate is refused by the table');
select extensions.is((pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map', 'evidenceRefs',
  jsonb_build_array(jsonb_build_object('playerName', 'X')), 'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-CANCEL'),
  'appPlayerId', (select id from app.players where slug = 'cancel-player')))) -> 'proposals' -> 0 ->> 'code'),
  'invalid_proposal', '11.11 evidence references that carry a name key are refused by the function');

-- ===========================================================================
-- 12. Retention: only the display name, 90 days after mapped or ignored
-- ===========================================================================
select pg_temp.put('fp_before', (select fingerprint from app_private.football_player_mapping_proposals where id = pg_temp.get('happy')::uuid));
update app_private.football_player_mapping_candidates set status_changed_at = now() - interval '100 days'
  where external_id in ('S-HAPPY', 'S-IGN', 'S-REP2');
update app_private.football_player_mapping_candidates set status_changed_at = now() - interval '89 days'
  where external_id = 'F-HAPPY';
select extensions.isnt((select display_name from app_private.football_player_mapping_candidates where external_id = 'S-HAPPY'), null, '12.1 before the purge the name is there');
select pg_temp.act('svc');
select extensions.is(api.football_mapping_purge_display_names(), 2,
  '12.2 the purge clears mapped candidates older than 90 days (S-HAPPY and S-REP2; the unmapped S-IGN is not ignored any more)');
select extensions.is((select display_name from app_private.football_player_mapping_candidates where external_id = 'S-HAPPY'), null, '12.3 the name is gone');
select extensions.isnt((select display_name_purged_at from app_private.football_player_mapping_candidates where external_id = 'S-HAPPY'), null, '12.4 and the purge is stamped');
select extensions.is((select status = 'mapped' and existing_mapping_id is not null from app_private.football_player_mapping_candidates where external_id = 'S-HAPPY'),
  true, '12.5 the provider id, status and mapping reference stay');
select extensions.is((select fingerprint from app_private.football_player_mapping_proposals where id = pg_temp.get('happy')::uuid), pg_temp.get('fp_before'),
  '12.6 no fingerprint changed: a name was never part of one');
select extensions.is(app_private.football_mapping_row_fingerprint(p), p.fingerprint,
  '12.7 and every fingerprint still recomputes from its row') from app_private.football_player_mapping_proposals p where p.id = pg_temp.get('happy')::uuid;
select extensions.isnt((select display_name from app_private.football_player_mapping_candidates where external_id = 'S-ELSE'), null,
  '12.8 a candidate that is not mapped or ignored keeps its name');
select extensions.is((select status = 'mapped' and display_name is not null from app_private.football_player_mapping_candidates where external_id = 'F-HAPPY'), true,
  '12.8a a mapped candidate keeps its name when it has been mapped for less than 90 days');
select extensions.isnt((select display_name from app_private.football_player_mapping_candidates where external_id = 'F-HAPPY'), null,
  '12.8b a mapped candidate younger than 90 days keeps its name');
select extensions.is((select count(*)::int from app_private.admin_audit_events where action = 'football.mapping_executed'), (select count(*)::int from app_private.football_player_mapping_proposals where status = 'executed'),
  '12.9 every audit event is still there');

-- ===========================================================================
-- 13. Reads and the second reviewer (decision D4)
-- ===========================================================================
select pg_temp.act('a');
select extensions.is(jsonb_array_length(api.admin_football_mapping_list_candidates('mapped')) >= 3, true, '13.1 the queue lists mapped candidates');
select extensions.is(jsonb_array_length(api.admin_football_mapping_list_proposals('open')) >= 1, true, '13.2 and open proposals');
select extensions.is((api.admin_football_mapping_reviewer_availability() ->> 'secondReviewerRequired')::boolean, false,
  '13.3 with other qualified reviewers, the screen does not ask for one');
update app_private.staff_principals set status = 'suspended', suspended_at = now(), suspension_reason = 'Suspended for the test of one reviewer.',
  suspended_by_principal_id = pg_temp.pid('a') where id in (pg_temp.pid('b'), pg_temp.pid('c'))
  or auth_user_id in ('e1000000-0000-4000-8000-0000000000d1', 'e1000000-0000-4000-8000-0000000000e1');
select extensions.is((api.admin_football_mapping_reviewer_availability() ->> 'qualifiedReviewersAvailable')::int, 0,
  '13.4 with one operator left, no second qualified reviewer is available');
select extensions.is((api.admin_football_mapping_reviewer_availability() ->> 'secondReviewerRequired')::boolean, true,
  '13.5 and the answer is "second qualified reviewer required"');
select pg_temp.record(pg_temp.obs('sofascore', 'S-LONE', 'T-100'));
select pg_temp.mkplayer('lone-player', 'forward', '1986-06-16');
select pg_temp.put('lone', (pg_temp.propose('a', jsonb_build_array(jsonb_build_object('kind', 'map', 'sofascoreCandidateId', pg_temp.cid('sofascore', 'S-LONE'),
  'appPlayerId', (select id from app.players where slug = 'lone-player')))) -> 'proposals' -> 0 ->> 'id'));
select extensions.throws_ok($$select pg_temp.decide('a', pg_temp.get('lone')::uuid)$$, 'PT403', 'self_approval_denied', '13.6 a lone operator cannot approve their own proposal');
select extensions.throws_ok($$select pg_temp.decide('b', pg_temp.get('lone')::uuid)$$, 'PT403', 'staff_suspended', '13.7 and a suspended operator cannot approve either: there is no bypass');
select extensions.is(pg_temp.pstatus(pg_temp.get('lone')::uuid), 'pending', '13.8 so the proposal simply waits');

select * from extensions.finish();
rollback;
