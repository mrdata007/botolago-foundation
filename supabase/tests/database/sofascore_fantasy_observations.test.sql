begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- SofaScore-only observations (api.service_record_sofascore_fantasy_observation).
-- Real functions, synthetic world:
--   1 who may call it   2 dry run   3 record, then retry   4 identities and fixture are reviewed
--   5 one SofaScore match per fixture   6 coverage and evidence rules   7 recorder guards
--   8 a reviewed correction still wins   7c unknown starters   9 the automatic path's state

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
-- The SofaScore rating rides along in each row (top-level `rating`, outside `stats`): a number
-- 0..10 with two decimals at most, or null (docs/backend/FANTASY_RATING_POINTS.md, 20261014090000).
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request((select jsonb_agg(pg_temp.row(i, true,
    jsonb_build_object('rating', case when i = 3 then null else 6.5 + i / 10.0 end)) order by i) from generate_series(1, 22) i)), true),
  'ok', '2.7 rows carrying a SofaScore rating (and a null one) are accepted');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request((select jsonb_agg(pg_temp.row(i, true,
    jsonb_build_object('rating', 7.555)) order by i) from generate_series(1, 22) i)), true),
  'fantasy_observation_rating_invalid', '2.8 a rating with more than two decimals is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request((select jsonb_agg(pg_temp.row(i, true,
    jsonb_build_object('rating', 12)) order by i) from generate_series(1, 22) i)), true),
  'fantasy_observation_rating_invalid', '2.9 a rating above 10 is refused');
select extensions.is(pg_temp.observations(), 0, '2.10 the dry runs with ratings stored nothing');

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
-- A fixture has one SofaScore mapping (unique per internal id), so the other
-- match is reached by re-pointing it, then put back for the sections below.
update app_private.football_provider_mappings set external_id = '9003'
where provider_name = 'sofascore' and entity_type = 'fixture' and internal_entity_id = pg_temp.id('f0', 1);
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(null, '{}', '9003')), 'sofascore_fixture_link_conflict',
  '5.1 a fixture linked to one SofaScore match cannot be fed from another');
update app_private.football_provider_mappings set external_id = '9001'
where provider_name = 'sofascore' and entity_type = 'fixture' and internal_entity_id = pg_temp.id('f0', 1);

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
  'sofascore_request_invalid', '6.3 an estimate is refused (the estimate check runs before the per-field evidence check)');
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
-- 7b. Unknown substitutes (migration 20261011190000): an unmapped substitute the
--     auto-mapping queued as no_candidate may be left out of the rows, listed in
--     the request; the database confirms it against the queue and the squad.
--     Home club 1 (squad 1-11, 23), away club 2 (squad 12-22, 24; 24 is unmapped).
-- ===========================================================================
create function pg_temp.ex(p_id text, p_side text default 'home', p_shirt integer default 40, p_pos text default 'M')
returns jsonb language sql as $$
  select jsonb_build_object('sofascoreId', p_id, 'side', p_side, 'shirtNumber', p_shirt, 'position', p_pos, 'reason', 'no_candidate')
$$;
create function pg_temp.exreq(p_arr jsonb) returns jsonb language sql as $$
  select jsonb_set(pg_temp.request(), '{payload}', ((pg_temp.request() -> 'payload') - 'squadComplete')
    || jsonb_build_object('squadCompleteExceptExcluded', true, 'excludedUnmappedPlayers', p_arr))
$$;
insert into app_private.sofascore_player_match_queue (sofascore_player_id, fixture_id, team_id, side, name, shirt_number, position, reason)
values ('S900', pg_temp.id('f0', 1), pg_temp.id('c1', 1), 'home', 'Unknown Home Sub', 40, 'midfielder', 'no_candidate'),
  ('S901', pg_temp.id('f0', 1), pg_temp.id('c1', 1), 'home', 'Ambiguous Home Sub', 41, 'midfielder', 'ambiguous_name'),
  ('S902', pg_temp.id('f0', 1), pg_temp.id('c1', 2), 'away', 'Unknown Away Sub', 24, 'defender', 'no_candidate');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), jsonb_set(pg_temp.request(), '{payload,excludedUnmappedPlayers}', jsonb_build_array(pg_temp.ex('S900')))),
  'sofascore_request_invalid', '7b.1 a list of exclusions next to squadComplete is refused (one or the other)');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), jsonb_set(pg_temp.request(), '{payload,squadCompleteExceptExcluded}', 'true')),
  'sofascore_request_invalid', '7b.2 squadCompleteExceptExcluded needs the list (and replaces squadComplete)');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.exreq('[]')), 'sofascore_request_invalid', '7b.3 and the list cannot be empty');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.exreq(jsonb_build_array(pg_temp.ex('S777')))),
  'sofascore_unmapped_exclusion_refused', '7b.4 a player the queue does not hold is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.exreq(jsonb_build_array(pg_temp.ex('S901', 'home', 41)))),
  'sofascore_unmapped_exclusion_refused', '7b.5 a queued player whose reason is not no_candidate is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.exreq(jsonb_build_array(pg_temp.ex('S900', 'away')))),
  'sofascore_unmapped_exclusion_refused', '7b.6 a queued player of the other club is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.exreq(jsonb_build_array(pg_temp.ex('S23')))),
  'sofascore_unmapped_exclusion_refused', '7b.7 a player who has a mapping is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.exreq(jsonb_build_array(pg_temp.ex('S5')))),
  'sofascore_request_invalid', '7b.8 a player who also has a row is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.exreq(jsonb_build_array(pg_temp.ex('S900'), pg_temp.ex('S900')))),
  'sofascore_request_invalid', '7b.9 a duplicate is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.exreq(jsonb_build_array(pg_temp.ex('S900') || '{"name":"x"}'))),
  'sofascore_request_invalid', '7b.10 an entry carries no name or other field');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.exreq(jsonb_build_array(pg_temp.ex('S900') || '{"reason":"ambiguous_name"}'))),
  'sofascore_request_invalid', '7b.11 the only reason accepted is no_candidate');
-- S902 (away, shirt 24, defender): squad member 24 is unmapped and wears 24, so he could be 24.
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.exreq(jsonb_build_array(pg_temp.ex('S902', 'away', 24, 'D')))),
  'sofascore_unmapped_exclusion_refused', '7b.12 an unmapped squad member with the same shirt number could be him: refused');
select extensions.is(pg_temp.observations(), 1, '7b.13 nothing of this was stored');
select extensions.is((api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1),
  pg_temp.exreq(jsonb_build_array(pg_temp.ex('S900'))), true) ->> 'excludedUnmapped')::int, 1,
  '7b.14 a confirmed unknown substitute is accepted (dry run), and counted');
select extensions.is((api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1),
  pg_temp.exreq(jsonb_build_array(pg_temp.ex('S900'))), true) ->> 'nonParticipants')::int, 2,
  '7b.15 the squad members missing from the rows are still the derived non-participants (23 and 24)');
select extensions.is(pg_temp.observations(), 1, '7b.16 the dry run stored nothing');
select pg_temp.put('rec', api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1),
  pg_temp.exreq(jsonb_build_array(pg_temp.ex('S900'))), false)::text);
select extensions.is((pg_temp.get('rec')::jsonb ->> 'created')::boolean, true, '7b.17 recorded for real');
select extensions.is((select payload #>> '{excludedUnmappedPlayers,0,sofascoreId}' from app_private.fantasy_fixture_observations order by id desc limit 1),
  'S900', '7b.18 the stored observation lists the exclusion (auditable)');
select extensions.is((select payload ? 'squadComplete' or payload ? 'squadCompleteExceptExcluded' from app_private.fantasy_fixture_observations order by id desc limit 1),
  false, '7b.19 and carries neither squad flag');
select extensions.is((select jsonb_array_length(payload -> 'players') from app_private.fantasy_fixture_observations order by id desc limit 1), 22,
  '7b.20 with no row for the unknown player');
select extensions.is((select jsonb_array_length(payload -> 'verifiedNonParticipants') from app_private.fantasy_fixture_observations order by id desc limit 1), 2,
  '7b.21 and the derived non-participants');
select extensions.is((select count(*)::int from app_private.fantasy_fixture_observations), 2,
  '7b.22 a second observation for the fixture (its facts differ by the exclusion)');

-- ===========================================================================
-- 7c. Unknown starters (migration 20261012120000): a starter left out says
--     started: true and counts as an anonymous starter of his club, at most two a
--     club; the request's counts must say exactly that; goals must still add up.
--     Home starter 5 is replaced in these requests by an unknown starter.
-- ===========================================================================
insert into app_private.sofascore_player_match_queue (sofascore_player_id, fixture_id, team_id, side, name, shirt_number, position, reason)
values ('S903', pg_temp.id('f0', 1), pg_temp.id('c1', 1), 'home', 'Unknown Home Starter', 43, 'defender', 'no_candidate'),
  ('S904', pg_temp.id('f0', 1), pg_temp.id('c1', 1), 'home', 'Unknown Home Starter Two', 44, 'midfielder', 'no_candidate'),
  ('S905', pg_temp.id('f0', 1), pg_temp.id('c1', 1), 'home', 'Unknown Home Starter Three', 45, 'forward', 'no_candidate');
create function pg_temp.streq(p_without integer[], p_arr jsonb, p_anon integer, p_by jsonb) returns jsonb language sql as $$
  select jsonb_set(pg_temp.request((select jsonb_agg(pg_temp.row(i) order by i) from generate_series(1, 22) i
                                     where not i = any (p_without))),
    '{payload}', ((pg_temp.request() -> 'payload') - 'squadComplete' - 'players')
      || jsonb_build_object('players', (select jsonb_agg(pg_temp.row(i) order by i) from generate_series(1, 22) i
                                         where not i = any (p_without)),
           'squadCompleteExceptExcluded', true, 'excludedUnmappedPlayers', p_arr,
           'anonymousStarters', p_anon, 'anonymousByTeam', p_by))
$$;
select pg_temp.put('n7c', pg_temp.observations()::text);
select extensions.is((api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1),
  pg_temp.streq(array[5], jsonb_build_array(pg_temp.ex('S903', 'home', 43, 'D') || '{"started":true}'), 1,
    jsonb_build_object(pg_temp.id('c1', 1)::text, 1)), true) ->> 'excludedUnmapped')::int, 1,
  '7c.1 an unknown starter is accepted as one anonymous starter of his club (dry run)');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1),
  pg_temp.streq(array[5], jsonb_build_array(pg_temp.ex('S903', 'home', 43, 'D') || '{"started":true}'), 0, '{}'::jsonb), true),
  'sofascore_request_invalid', '7c.2 the request must count him as an anonymous starter');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1),
  pg_temp.streq(array[5], jsonb_build_array(pg_temp.ex('S903', 'home', 43, 'D') || '{"started":true}'), 1,
    jsonb_build_object(pg_temp.id('c1', 2)::text, 1)), true),
  'sofascore_request_invalid', '7c.3 for his own club');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1),
  pg_temp.streq(array[]::integer[], jsonb_build_array(pg_temp.ex('S900')), 1,
    jsonb_build_object(pg_temp.id('c1', 1)::text, 1)), true),
  'sofascore_request_invalid', '7c.4 anonymous starters with no starter left out are refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1),
  pg_temp.streq(array[5], jsonb_build_array(pg_temp.ex('S903', 'home', 43, 'D') || '{"started":"yes"}'), 1,
    jsonb_build_object(pg_temp.id('c1', 1)::text, 1)), true),
  'sofascore_request_invalid', '7c.5 started is a boolean');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1),
  pg_temp.streq(array[5, 6, 7], jsonb_build_array(
      pg_temp.ex('S903', 'home', 43, 'D') || '{"started":true}',
      pg_temp.ex('S904', 'home', 44, 'M') || '{"started":true}',
      pg_temp.ex('S905', 'home', 45, 'F') || '{"started":true}'), 3,
    jsonb_build_object(pg_temp.id('c1', 1)::text, 3)), true),
  'sofascore_request_invalid', '7c.6 more than two unknown starters of one club are refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1),
  pg_temp.streq(array[10], jsonb_build_array(pg_temp.ex('S903', 'home', 43, 'D') || '{"started":true}'), 1,
    jsonb_build_object(pg_temp.id('c1', 1)::text, 1)), true),
  'sofascore_unmapped_exclusion_refused', '7c.7 leaving out the scorer is refused: the goals in the rows must add up');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1),
  pg_temp.streq(array[5], jsonb_build_array(pg_temp.ex('S903', 'home', 43, 'D')), 0, '{}'::jsonb), true),
  'adaptive_starters_incomplete', '7c.8 a starter left out without started: true leaves ten starters: the recorder refuses');
select extensions.is((api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1),
  pg_temp.streq(array[5, 6], jsonb_build_array(
      pg_temp.ex('S903', 'home', 43, 'D') || '{"started":true}',
      pg_temp.ex('S904', 'home', 44, 'M') || '{"started":true}'), 2,
    jsonb_build_object(pg_temp.id('c1', 1)::text, 2)), true) ->> 'excludedUnmapped')::int, 2,
  '7c.9 two unknown starters of one club are accepted');
select extensions.is(pg_temp.observations()::text, pg_temp.get('n7c'), '7c.10 the dry runs stored nothing');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), jsonb_set(pg_temp.request(), '{payload,anonymousStarters}', '1')),
  'sofascore_request_invalid', '7c.11 a request with no exclusions still has no anonymous starters');

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

-- ===========================================================================
-- 9. The state of the automatic path (migration 20261011140000)
--    Fixture 2 (SofaScore event 9002) is finished, finalized, in a gameweek with
--    adaptive scoring on, and has no observation.
-- ===========================================================================
select pg_temp.act('svc');
select extensions.ok(not has_function_privilege('anon', 'api.service_sofascore_fantasy_context(uuid,text[])', 'execute'), '9.1 context: not callable by visitors');
select extensions.ok(not has_function_privilege('authenticated', 'api.service_sofascore_fantasy_context(uuid,text[])', 'execute'), '9.2 context: not callable by signed-in users');
select extensions.ok(has_function_privilege('service_role', 'api.service_sofascore_fantasy_context(uuid,text[])', 'execute'), '9.3 context: callable by the service role');
select extensions.ok(not has_function_privilege('authenticated', 'api.service_sofascore_fantasy_note(uuid,text,text,text,jsonb,jsonb,text,timestamptz)', 'execute'), '9.4 note: not callable by signed-in users');
select extensions.ok(has_function_privilege('service_role', 'api.service_sofascore_fantasy_note(uuid,text,text,text,jsonb,jsonb,text,timestamptz)', 'execute'), '9.5 note: callable by the service role');
select extensions.ok(not has_function_privilege('authenticated', 'api.service_sofascore_fantasy_due(integer,integer,integer,integer,integer)', 'execute'), '9.6 due: not callable by signed-in users');
select extensions.ok(has_function_privilege('service_role', 'api.service_sofascore_fantasy_due(integer,integer,integer,integer,integer)', 'execute'), '9.7 due: callable by the service role');
select extensions.ok(not has_table_privilege('service_role', 'app_private.sofascore_fantasy_attempts', 'select'), '9.8 the attempts table is not readable through the API role');

select extensions.is(api.service_sofascore_fantasy_context(gen_random_uuid()) ->> 'found', 'false', '9.9 an unknown fixture is not found');
select pg_temp.put('ctx', api.service_sofascore_fantasy_context(pg_temp.id('f0', 2), array['S1', 'S99'])::text);
select extensions.is(pg_temp.get('ctx')::jsonb ->> 'sofascoreEventId', '9002', '9.10 the context names the fixture mapping');
select extensions.is(pg_temp.get('ctx')::jsonb ->> 'status', 'finished', '9.11 and its status');
select extensions.is((pg_temp.get('ctx')::jsonb ->> 'adaptiveEnabled')::boolean, true, '9.12 adaptive scoring is on for its gameweek');
select extensions.is((pg_temp.get('ctx')::jsonb ->> 'observations')::int, 0, '9.13 it has no observation');
select extensions.is(pg_temp.get('ctx')::jsonb -> 'attempt', 'null'::jsonb, '9.14 and no attempt');
select extensions.is(jsonb_array_length(pg_temp.get('ctx')::jsonb -> 'players'), 1, '9.15 only the asked player ids that have a mapping come back');
select extensions.is((pg_temp.get('ctx')::jsonb -> 'players' -> 0 ->> 'reviewed')::boolean, true, '9.16 with their review state');
select extensions.is((api.service_sofascore_fantasy_context(pg_temp.id('f0', 1)) ->> 'observations')::int > 0, true, '9.17 an observed fixture says so');

select extensions.is((api.service_sofascore_fantasy_note(pg_temp.id('f0', 2), '9002', 'held', 'unmapped_players',
  '[{"code":"unmapped_players"}]', '{"version":1}', repeat('cd', 32), now() - interval '1 minute') ->> 'attempts')::int, 1,
  '9.18 a first held attempt is stored');
select extensions.is((api.service_sofascore_fantasy_due(6, 1, 72, 24, 4) -> 'retry') ? pg_temp.id('f0', 2)::text, true,
  '9.19 and is due for a retry');
select extensions.is((api.service_sofascore_fantasy_due(6, 1, 72, 24, 4) -> 'retry') ? pg_temp.id('f0', 1)::text, false,
  '9.20 an observed fixture is never due');
select extensions.is((api.service_sofascore_fantasy_context(pg_temp.id('f0', 2)) -> 'attempt' -> 'matchData' ->> 'version'), '1',
  '9.21 the stored replies come back with the context');
select extensions.is((api.service_sofascore_fantasy_note(pg_temp.id('f0', 2), '9002', 'held', 'unmapped_players',
  '[]', null, null, now() - interval '1 minute') ->> 'attempts')::int, 2, '9.22 a second attempt is counted');
select extensions.is((api.service_sofascore_fantasy_context(pg_temp.id('f0', 2)) -> 'attempt' -> 'matchData' ->> 'version'), '1',
  '9.23 and the stored replies are kept when none are given');
-- 20261013150100: the attempt-limit argument is accepted and ignored. A held match is
-- retried until kickoff + 21 days whatever its attempt count; past that (this fixture
-- kicked off on 2026-08-11) it keeps three tries, and it has had two.
select extensions.is((api.service_sofascore_fantasy_due(6, 1, 72, 2, 4) -> 'retry') ? pg_temp.id('f0', 2)::text, true,
  '9.24 the old attempt limit no longer ends retries (two of three tries used)');
select extensions.is(api.service_sofascore_fantasy_note(pg_temp.id('f0', 2), '9002', 'gave_up', 'needs_review',
  '[]', null, null, null) ->> 'status', 'gave_up', '9.25 giving up is stored');
select extensions.is((api.service_sofascore_fantasy_context(pg_temp.id('f0', 2)) -> 'attempt' ->> 'matchData') is null, true,
  '9.26 and drops the stored replies');
-- Reopening (migration 20261012120000). Fixture 2 was just given up for 'needs_review'.
select pg_temp.act('svc');
select extensions.is(app_private.sofascore_fantasy_reopen(pg_temp.id('c1', 2), null), 0,
  '9.26a a club''s matches are reopened only when they wait on a player identity');
select api.service_sofascore_fantasy_note(pg_temp.id('f0', 2), '9002', 'gave_up', 'unmapped_players',
  '[{"code":"unmapped_players"}]', null, null, null);
select pg_temp.act('op');
select pg_temp.put('res', api.admin_resolve_sofascore_player_match('S902', pg_temp.id('a1', 24))::text);
select pg_temp.act('svc');
select extensions.is((pg_temp.get('res')::jsonb ->> 'reopened')::int, 1,
  '9.26b staff matching a player reopens his club''s match that waits on a player identity');
select extensions.is((select status || '/' || attempts from app_private.sofascore_fantasy_attempts where fixture_id = pg_temp.id('f0', 2)),
  'held/0', '9.26c held again, attempts reset');
select extensions.ok((select next_retry_at <= statement_timestamp() from app_private.sofascore_fantasy_attempts where fixture_id = pg_temp.id('f0', 2)),
  '9.26d and due on the next tick');
select extensions.is(app_private.sofascore_fantasy_reopen(null, null), 0, '9.26e no club and no fixture reopens nothing');
select api.service_sofascore_fantasy_note(pg_temp.id('f0', 2), '9002', 'gave_up', 'needs_review', '[]', null, null, null);
select extensions.is(app_private.sofascore_fantasy_reopen(null, pg_temp.id('f0', 2)), 1,
  '9.26f a named match is reopened whatever held it');
select api.service_sofascore_fantasy_note(pg_temp.id('f0', 1), '9001', 'gave_up', 'unmapped_players',
  '[{"code":"unmapped_players"}]', null, null, null);
select extensions.is(app_private.sofascore_fantasy_reopen(null, pg_temp.id('f0', 1)), 0,
  '9.26g a match with an observation is never reopened');
select extensions.ok(not has_function_privilege('service_role', 'app_private.sofascore_fantasy_reopen(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app_private.sofascore_fantasy_reopen(uuid,uuid)', 'execute'),
  '9.26h the reopening helper is internal');
select extensions.is(api.service_sofascore_fantasy_note(pg_temp.id('f0', 2), '9002', 'recorded', 'recorded',
  '[]', null, repeat('ef', 32), null) ->> 'status', 'recorded', '9.27 a recorded fixture is stored');
select extensions.is((api.service_sofascore_fantasy_note(pg_temp.id('f0', 2), '9002', 'held', 'late',
  '[]', null, null, null) ->> 'unchanged')::boolean, true, '9.28 and stays recorded');

select extensions.throws_ok($$select api.service_sofascore_fantasy_note('f0000000-0000-4000-8000-000000000002', '9002', 'bogus', 'x', '[]', null, null, null)$$,
  'PT400', 'sofascore_fantasy_note_invalid', '9.29 an unknown status is refused');
select extensions.throws_ok($$select api.service_sofascore_fantasy_note('f0000000-0000-4000-8000-0000000000ff', '9002', 'held', 'x', '[]', null, null, null)$$,
  'PT404', 'sofascore_fantasy_fixture_not_found', '9.30 an unknown fixture is refused');
select extensions.throws_ok($$select api.service_sofascore_fantasy_due(6, 11, 72, 24, 4)$$,
  'PT400', 'sofascore_fantasy_due_invalid', '9.31 an out-of-range limit is refused');
select pg_temp.act('op');
select extensions.throws_ok($$select api.service_sofascore_fantasy_due(6, 1, 72, 24, 4)$$,
  'PT403', 'forbidden', '9.32 a signed-in user is refused');
select pg_temp.act('svc');

select * from extensions.finish();
rollback;
