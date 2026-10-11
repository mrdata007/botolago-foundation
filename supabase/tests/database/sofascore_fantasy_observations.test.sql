begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- SofaScore-only observations (api.service_record_sofascore_fantasy_observation).
-- Real functions, synthetic world:
--   1 who may call it   2 dry run   3 record, then retry   4 identities and fixture are reviewed
--   5 one SofaScore match per fixture   6 coverage and evidence rules   7 recorder guards
--   8 a reviewed correction still wins

create temporary table stash (k text primary key, v text);
create function pg_temp.put(p_key text, p_value text) returns void language sql as
  $$ insert into stash values (p_key, p_value) on conflict (k) do update set v = excluded.v $$;
create function pg_temp.get(p_key text) returns text language sql as
  $$ select v from stash where k = p_key $$;
create function pg_temp.id(p_prefix text, n integer) returns uuid language sql immutable as
  $$ select (p_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Staff operator who reviews the identities (aal2, single approver).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.id('e1', 1), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'sfs-op@example.test', 'hash', now(), '{}', '{"username":"sfs_op"}', now(), now());
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (pg_temp.id('e3', 1), pg_temp.id('e1', 1), 'TOTP', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at) values (pg_temp.id('e2', 1), pg_temp.id('e1', 1), now());
insert into app_private.staff_principals (auth_user_id) values (pg_temp.id('e1', 1));
insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select sp.id, r.id, 'Operator for the SofaScore Fantasy test.'
from app_private.staff_principals sp, app_private.admin_roles r
where sp.auth_user_id = pg_temp.id('e1', 1) and r.name = 'football_operator';
update app_private.football_mapping_settings set allow_self_approval = true;

create function pg_temp.act(p_who text) returns void language plpgsql as $$
begin
  if p_who = 'svc' then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('e1', 1), 'role', 'authenticated',
      'aal', 'aal2', 'session_id', pg_temp.id('e2', 1))::text, true);
  end if;
end $$;

-- Football world: one finished match, home 1 - 0 away, players 1-11 home, 12-22 away, 23/24 spares.
insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id('c0', 1), 'MA', 'MAR')
  on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id('c0', 2), 'sofa-fantasy-test', 'SofaScore Fantasy Test', 'RT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id('c0', 3), pg_temp.id('c0', 2), '2026/2027', '2026-08-01', '2027-06-30', 'active', false);
insert into app.rounds (id, season_id, round_number, name, status)
values (pg_temp.id('c0', 7), pg_temp.id('c0', 3), 1, 'Round 1', 'completed');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id('c1', i), 'sfs-club-' || i, 'Sfs Club ' || i, 'RC' || i, 'RC' || i,
  (select id from app.countries where iso_alpha2 = 'MA') from generate_series(1, 3) i;
create temporary table world (i integer primary key, club integer not null, pos text not null);
insert into world select i, case when i <= 11 or i = 23 then 1 else 2 end,
  case when i in (1, 12) then 'goalkeeper' when (i - 1) % 11 between 1 and 4 then 'defender'
       when (i - 1) % 11 between 5 and 8 then 'midfielder' else 'forward' end
from generate_series(1, 24) i;
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.id('a1', i), 'sfs-player-' || i, 'Sfs Player ' || i, 'RP' || i, pos::app.football_position from world;
insert into app.team_memberships (player_id, team_id, season_id, valid_from, shirt_number)
select pg_temp.id('a1', i), pg_temp.id('c1', club), pg_temp.id('c0', 3), '2026-08-01', i from world;
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status,
  home_score, away_score, provider_updated_at, source_sequence, finalized_at)
values (pg_temp.id('f0', 1), pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c0', 7), pg_temp.id('c1', 1),
  pg_temp.id('c1', 2), '2026-08-10 12:00Z', 'finished', 1, 0, '2026-08-10 14:00Z', 10, '2026-08-10 14:00Z'),
  (pg_temp.id('f0', 2), pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c0', 7), pg_temp.id('c1', 3),
  pg_temp.id('c1', 2), '2026-08-11 12:00Z', 'finished', 0, 0, '2026-08-11 14:00Z', 10, '2026-08-11 14:00Z');

-- Fantasy: one gameweek with both fixtures, adaptive scoring active.
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (pg_temp.id('c0', 4), pg_temp.id('c0', 2), 'sofa-fantasy-test', 'SofaScore Fantasy Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at)
values (pg_temp.id('c0', 5), pg_temp.id('c0', 4), pg_temp.id('c0', 3), 'f6100000-0000-4000-8000-000000000100',
  '2026/2027', 'active', '2026-08-01', '2027-06-30');
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name, deadline_at, starts_at, ends_at, status)
values (pg_temp.id('c0', 6), pg_temp.id('c0', 5), pg_temp.id('c0', 7), 1, 'GW1', '2026-08-10 10:30Z',
  '2026-08-10 12:00Z', '2026-08-12 12:00Z', 'provisional');
insert into app.fantasy_fixture_assignments (fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, frozen_at, source_version)
select pg_temp.id('c0', 5), f.id, pg_temp.id('c0', 6), pg_temp.id('c0', 6), f.kickoff_at, f.kickoff_at, '2026-08-10 10:30Z', 1
from app.fixtures f where f.id in (pg_temp.id('f0', 1), pg_temp.id('f0', 2));

-- Reviewed SofaScore identities: players 1-23 through the real reviewed flow. 24 is not mapped.
select pg_temp.act('svc');
select api.football_mapping_record_observations(jsonb_agg(jsonb_build_object(
  'provider', 'sofascore', 'externalPlayerId', 'S' || w.i, 'providerTeamId', 'ST' || w.club,
  'clubKey', 'sfs-club-' || w.club, 'appTeamId', pg_temp.id('c1', w.club), 'squadCompleteness', 'COMPLETE',
  'registeredTeamDisagreement', false, 'shirtNumber', w.i,
  'positionSignal', upper(left(w.pos, 1)), 'dobState', 'missing', 'displayName', 'Provider Name ' || w.i)))
from world w where w.i <= 23;
select pg_temp.act('op');
select api.admin_football_mapping_propose((select jsonb_agg(jsonb_build_object('kind', 'map',
    'sofascoreCandidateId', (select id from app_private.football_player_mapping_candidates where provider_name = 'sofascore' and external_id = 'S' || i),
    'appPlayerId', pg_temp.id('a1', i), 'basis', 'manual') order by i) from generate_series(1, 23) i),
  'Seed the reviewed SofaScore identities of the SofaScore Fantasy test.', gen_random_uuid());
do $$ declare p record; begin
  for p in select id, fingerprint from app_private.football_player_mapping_proposals where status = 'pending' order by id loop
    perform api.admin_football_mapping_decide(p.id, 'approve', 'Approved to seed the test world.', p.fingerprint, false, gen_random_uuid());
    perform api.admin_football_mapping_execute(p.id, gen_random_uuid());
  end loop;
end $$;
select extensions.is((select count(*)::int from app_private.football_provider_mappings m
  where m.active and m.provider_name = 'sofascore' and (app_private.football_mapping_supporting_state(m.id) ->> 'reviewed')::boolean), 23,
  '0.1 23 reviewed SofaScore player mappings exist, made through the reviewed flow');

-- Reviewed SofaScore fixture mappings: 9001 is fixture 1, 9002 is fixture 2.
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
values ('sofascore', 'fixture', '9001', pg_temp.id('f0', 1), 'test', now()),
  ('sofascore', 'fixture', '9002', pg_temp.id('f0', 2), 'test', now());

-- Adaptive scoring on for the gameweek.
select pg_temp.act('svc');
select api.service_activate_adaptive_scoring(pg_temp.id('c0', 5), 1,
  api.service_adaptive_scoring_audit(pg_temp.id('c0', 6)) ->> 'activationDigest');

-- The request the TypeScript builder sends. Detail fields are facts on a full-coverage match.
create function pg_temp.ev(p_state text default 'verified', p_source text default 'sofascore') returns jsonb language sql as $$
  select jsonb_build_object('state', p_state, 'source', p_source, 'observedAt', '2026-08-10T16:00:00Z',
    'references', jsonb_build_array('sofascore:event:9001'))
$$;
create function pg_temp.row(p_i integer, p_full boolean default true, p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('playerId', pg_temp.id('a1', p_i), 'teamId', pg_temp.id('c1', w.club), 'started', true,
    'identity', jsonb_build_object('sofascoreId', 'S' || p_i),
    'stats', jsonb_build_object('minutes', 90, 'goals', case when p_i = 10 then 1 else 0 end,
      'cleanSheet', w.club = 1, 'goalsConceded', case when w.club = 1 then 0 else 1 end,
      'yellowCards', 0, 'redCards', 0, 'secondYellowDismissals', 0, 'ownGoals', 0)
      || case when p_full then jsonb_build_object('assists', 0, 'penaltiesMissed', 0)
           || case when w.pos = 'goalkeeper' then jsonb_build_object('saves', 2, 'penaltiesSaved', 0) else '{}'::jsonb end
         else '{}'::jsonb end,
    'evidence', (select jsonb_object_agg(field, pg_temp.ev())
      from unnest(array['minutes','goals','cleanSheet','goalsConceded','yellowCards','redCards','secondYellowDismissals','ownGoals']
        || case when p_full then array['assists','penaltiesMissed'] || case when w.pos = 'goalkeeper' then array['saves','penaltiesSaved'] else array[]::text[] end
           else array[]::text[] end) field)
      || case when p_full then '{}'::jsonb else jsonb_build_object('assists', pg_temp.ev('unknown'), 'penaltiesMissed', pg_temp.ev('unknown')) end) || p_extra
  from world w where w.i = p_i
$$;
create function pg_temp.request(p_rows jsonb default null, p_extra jsonb default '{}', p_event text default '9001',
  p_full boolean default true) returns jsonb language sql as $$
  select jsonb_build_object('sofascoreEventId', p_event, 'mappingSnapshotDigest', repeat('ab', 32),
    'coverage', case when p_full then 'full' else 'limited' end,
    'payload', jsonb_build_object('homeScore', 1, 'awayScore', 0, 'anonymousStarters', 0, 'anonymousByTeam', '{}'::jsonb,
      'references', jsonb_build_array('sofascore:event:9001'),
      'participationComplete', true, 'disciplineComplete', true, 'squadComplete', true,
      'players', coalesce(p_rows, (select jsonb_agg(pg_temp.row(i, p_full) order by i) from generate_series(1, 22) i))) || p_extra)
$$;
create function pg_temp.code(p_fixture uuid, p_request jsonb, p_dry boolean default false) returns text language plpgsql as $$
begin
  perform api.service_record_sofascore_fantasy_observation(p_fixture, p_request, p_dry);
  return 'ok';
exception when others then return sqlerrm;
end $$;
create function pg_temp.observations() returns integer language sql as
  $$ select count(*)::int from app_private.fantasy_fixture_observations $$;

-- ===========================================================================
-- 1. Who may call it
-- ===========================================================================
select extensions.ok(not has_function_privilege('anon', 'api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)', 'execute'), '1.1 not callable by visitors');
select extensions.ok(not has_function_privilege('authenticated', 'api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)', 'execute'), '1.2 not callable by signed-in users');
select extensions.ok(has_function_privilege('service_role', 'api.service_record_sofascore_fantasy_observation(uuid,jsonb,boolean)', 'execute'), '1.3 callable by the service role');
select pg_temp.act('op');
select extensions.throws_ok($$select api.service_record_sofascore_fantasy_observation('f0000000-0000-4000-8000-000000000001', '{}', true)$$,
  'PT403', 'forbidden', '1.4 a non-service caller is refused even with execute');
select pg_temp.act('svc');

-- ===========================================================================
-- 2. Dry run: every guard runs, nothing stays; and what it reports
-- ===========================================================================
select extensions.is((api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(), true) ->> 'fullReady')::boolean, true,
  '2.1 a full-coverage match with every field a fact is full-ready');
select extensions.is((api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(null, '{}', '9001', false), true) ->> 'fullReady')::boolean, false,
  '2.2 a limited-coverage match is not full-ready');
select extensions.is((api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(null, '{}', '9001', false), true) ->> 'simpleReady')::boolean, true,
  '2.3 but it is simple-ready: assists, saves and penalties are unknown, not zero');
select extensions.is((api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(), true) ->> 'nonParticipants')::int, 2,
  '2.4 the two squad members who are not in the rows (23, 24) are the derived non-participants');
select extensions.is(pg_temp.observations(), 0, '2.5 the dry runs stored nothing');
select extensions.is((select count(*)::int from app_private.football_provider_fixture_links), 0, '2.6 and linked nothing');

-- ===========================================================================
-- 3. Record, then retry
-- ===========================================================================
select pg_temp.put('rec', api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(), false)::text);
select extensions.is((pg_temp.get('rec')::jsonb ->> 'created')::boolean, true, '3.1 recorded');
select extensions.is(pg_temp.observations(), 1, '3.2 one observation stored');
select extensions.is((select source from app_private.fantasy_fixture_observations), 'provider-reconciled', '3.3 under the recorder''s existing provider source');
select extensions.is((select count(*)::int from app_private.football_provider_fixture_links where provider_name = 'sofascore'), 1, '3.4 the fixture is linked to its SofaScore match');
select extensions.is((select count(*)::int from app_private.football_provider_fixture_links where provider_name <> 'sofascore'), 0, '3.5 and to no other provider');
select extensions.is((api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(), false) ->> 'created')::boolean, false,
  '3.6 the same facts again store nothing new');
select extensions.is(pg_temp.observations(), 1, '3.7 still one observation');
select extensions.is(coalesce(current_setting('botolago.reconciled_ingestion', true), ''), '', '3.8 the internal flag is cleared');

-- ===========================================================================
-- 4. Identities and the fixture must be reviewed
-- ===========================================================================
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(case when i = 5 then jsonb_set(pg_temp.row(i), '{identity,sofascoreId}', '"S23"') else pg_temp.row(i) end order by i) from generate_series(1, 22) i))),
  'sofascore_identity_not_reviewed', '4.1 a SofaScore id that maps another player is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(case when i = 5 then jsonb_set(pg_temp.row(i), '{identity,sofascoreId}', '"S999"') else pg_temp.row(i) end order by i) from generate_series(1, 22) i))),
  'sofascore_identity_not_reviewed', '4.2 an unmapped SofaScore id is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(null, '{}', '9002')), 'sofascore_fixture_mapping_missing',
  '4.3 the fixture must be the one the reviewed mapping names');
select extensions.is(pg_temp.code(pg_temp.id('f0', 9), pg_temp.request()), 'sofascore_fixture_not_found', '4.4 an unknown fixture is refused');

-- ===========================================================================
-- 5. One SofaScore match per fixture
-- ===========================================================================
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
values ('sofascore', 'fixture', '9003', pg_temp.id('f0', 1), 'test', now());
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(null, '{}', '9003')), 'sofascore_fixture_link_conflict',
  '5.1 a fixture linked to one SofaScore match cannot be fed from another');

-- ===========================================================================
-- 6. Coverage and evidence rules
-- ===========================================================================
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(case when i = 1 then jsonb_set(pg_temp.row(i, false), '{evidence,saves}', pg_temp.ev()) else pg_temp.row(i, false) end order by i) from generate_series(1, 22) i),
  '{}', '9001', false)), 'sofascore_limited_coverage_fields', '6.1 saves are never a fact on a limited-coverage match');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(case when i = 1 then jsonb_set(pg_temp.row(i, false), '{stats,saves}', '0') else pg_temp.row(i, false) end order by i) from generate_series(1, 22) i),
  '{}', '9001', false)), 'sofascore_limited_coverage_fields', '6.2 nor a zero written for them');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(case when i = 4 then jsonb_set(pg_temp.row(i), '{evidence,minutes,state}', '"estimated"') else pg_temp.row(i) end order by i) from generate_series(1, 22) i))),
  'sofascore_evidence_invalid', '6.3 an estimate is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(case when i = 4 then jsonb_set(pg_temp.row(i), '{evidence,goals,source}', '"another-feed"') else pg_temp.row(i) end order by i) from generate_series(1, 22) i))),
  'sofascore_evidence_invalid', '6.4 evidence from any other source is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(null, '{"reviewer":"someone"}')), 'sofascore_request_invalid', '6.5 correction fields are refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(null, '{"verifiedNonParticipants":[]}')), 'sofascore_request_invalid', '6.6 non-participants are derived, never supplied');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request() - 'mappingSnapshotDigest'), 'sofascore_request_invalid', '6.7 the snapshot digest is required');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), jsonb_set(pg_temp.request(), '{payload,squadComplete}', 'false')), 'sofascore_request_invalid', '6.8 the builder must state the squad is complete');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), jsonb_set(pg_temp.request(), '{sofascoreEventId}', '"9001; x"')), 'sofascore_request_invalid', '6.9 match ids are checked');

-- ===========================================================================
-- 7. The recorder's own guards still apply
-- ===========================================================================
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(pg_temp.row(i) order by i) from generate_series(1, 21) i))), 'adaptive_starters_incomplete',
  '7.1 a lineup that is not 11 + 11 is refused');
select pg_temp.act('svc');
select extensions.throws_ok(format($$select api.service_record_fantasy_observation(%L, %L, 'provider-reconciled')$$,
  pg_temp.id('f0', 1), (pg_temp.request() -> 'payload')::text),
  'PT400', 'adaptive_payload_invalid', '7.2 the recorder refuses the provider source when called directly (identities would be unchecked)');

-- ===========================================================================
-- 8. A reviewed correction still wins
-- ===========================================================================
select api.service_record_fantasy_observation(pg_temp.id('f0', 1),
  (pg_temp.request() -> 'payload') - 'players' - 'squadComplete' || jsonb_build_object(
    'players', (select jsonb_agg(pg_temp.row(i) - 'identity' order by i) from generate_series(1, 22) i),
    'reason', 'Reviewed official match sheet', 'reviewer', 'test-reviewer',
    'expectedDigest', pg_temp.get('rec')::jsonb ->> 'digest', 'references', jsonb_build_array('official:sheet:1')),
  'reviewed-correction');
select pg_temp.put('n8', pg_temp.observations()::text);
select extensions.is((api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(jsonb_set(pg_temp.row(i), '{stats,yellowCards}', (case when i = 3 then '1' else '0' end)::jsonb) order by i) from generate_series(1, 22) i)))
  ->> 'reviewedOverride')::boolean, true, '8.1 after a reviewed correction, new SofaScore facts do not replace it');
select extensions.is(pg_temp.observations()::text, pg_temp.get('n8'), '8.2 and nothing new is stored');

select * from extensions.finish();
rollback;
