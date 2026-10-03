begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- The bridge from the Sofascore + Flashscore reconciler to adaptive Fantasy scoring
-- (api.service_record_reconciled_fantasy_observation). Real functions, synthetic world:
--   1 who may call it          2 dry run: every guard runs, nothing stays
--   3 record, then retry       4 identities must be reviewed on both providers
--   5 one provider match per fixture   6 facts only, never estimates
--   7 the recorder's own guards still apply    8 a reviewed correction still wins

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
  'rec-op@example.test', 'hash', now(), '{}', '{"username":"rec_op"}', now(), now());
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (pg_temp.id('e3', 1), pg_temp.id('e1', 1), 'TOTP', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at) values (pg_temp.id('e2', 1), pg_temp.id('e1', 1), now());
insert into app_private.staff_principals (auth_user_id) values (pg_temp.id('e1', 1));
insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select sp.id, r.id, 'Operator for the reconciled ingestion test.'
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
values (pg_temp.id('c0', 2), 'reconciled-test', 'Reconciled Test', 'RT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id('c0', 3), pg_temp.id('c0', 2), '2026/2027', '2026-08-01', '2027-06-30', 'active', false);
insert into app.rounds (id, season_id, round_number, name, status)
values (pg_temp.id('c0', 7), pg_temp.id('c0', 3), 1, 'Round 1', 'completed');
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id('c1', i), 'rec-club-' || i, 'Rec Club ' || i, 'RC' || i, 'RC' || i,
  (select id from app.countries where iso_alpha2 = 'MA') from generate_series(1, 3) i;
create temporary table world (i integer primary key, club integer not null, pos text not null);
insert into world select i, case when i <= 11 or i = 23 then 1 else 2 end,
  case when i in (1, 12) then 'goalkeeper' when (i - 1) % 11 between 1 and 4 then 'defender'
       when (i - 1) % 11 between 5 and 8 then 'midfielder' else 'forward' end
from generate_series(1, 24) i;
insert into app.players (id, slug, full_name, display_name, position)
select pg_temp.id('a1', i), 'rec-player-' || i, 'Rec Player ' || i, 'RP' || i, pos::app.football_position from world;
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
values (pg_temp.id('c0', 4), pg_temp.id('c0', 2), 'reconciled-test', 'Reconciled Test', true);
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

-- Reviewed identities: players 1-22 mapped on BOTH providers through the real reviewed flow
-- (one combined proposal per player). 23 is mapped on Sofascore only. 24 is not mapped.
select pg_temp.act('svc');
select api.football_mapping_record_observations(jsonb_agg(jsonb_build_object(
  'provider', p.provider, 'externalPlayerId', p.prefix || w.i, 'providerTeamId', p.prefix || 'T' || w.club,
  'clubKey', 'rec-club-' || w.club, 'appTeamId', pg_temp.id('c1', w.club), 'squadCompleteness', 'COMPLETE',
  'registeredTeamDisagreement', false, 'shirtNumber', w.i,
  'positionSignal', upper(left(w.pos, 1)), 'dobState', 'missing', 'displayName', 'Provider Name ' || w.i)))
from world w cross join (values ('sofascore', 'S'), ('flashscore', 'F')) p(provider, prefix);
select pg_temp.act('op');
select api.admin_football_mapping_propose((select jsonb_agg(jsonb_build_object('kind', 'map',
    'sofascoreCandidateId', (select id from app_private.football_player_mapping_candidates where provider_name = 'sofascore' and external_id = 'S' || i),
    'flashscoreCandidateId', (select id from app_private.football_player_mapping_candidates where provider_name = 'flashscore' and external_id = 'F' || i),
    'appPlayerId', pg_temp.id('a1', i), 'basis', 'manual') order by i) from generate_series(1, 22) i),
  'Seed the reviewed identities of the reconciled ingestion test.', gen_random_uuid());
select api.admin_football_mapping_propose(jsonb_build_array(jsonb_build_object('kind', 'map',
    'sofascoreCandidateId', (select id from app_private.football_player_mapping_candidates where provider_name = 'sofascore' and external_id = 'S23'),
    'appPlayerId', pg_temp.id('a1', 23), 'basis', 'manual')),
  'Seed a Sofascore-only identity for the reconciled ingestion test.', gen_random_uuid());
do $$ declare p record; begin
  for p in select id, fingerprint from app_private.football_player_mapping_proposals where status = 'pending' order by id loop
    perform api.admin_football_mapping_decide(p.id, 'approve', 'Approved to seed the test world.', p.fingerprint, false, gen_random_uuid());
    perform api.admin_football_mapping_execute(p.id, gen_random_uuid());
  end loop;
end $$;
select extensions.is((select count(*)::int from app_private.football_provider_mappings m
  where m.active and (app_private.football_mapping_supporting_state(m.id) ->> 'reviewed')::boolean), 45,
  '0.1 45 reviewed mappings exist (22 players on both providers, one Sofascore-only), made through the reviewed flow');

-- Adaptive scoring on for the gameweek.
select pg_temp.act('svc');
select api.service_activate_adaptive_scoring(pg_temp.id('c0', 5), 1,
  api.service_adaptive_scoring_audit(pg_temp.id('c0', 6)) ->> 'activationDigest');

-- The request the TypeScript builder sends: rows with internal ids, reviewed provider ids, evidence.
create function pg_temp.row(p_i integer, p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('playerId', pg_temp.id('a1', p_i), 'teamId', pg_temp.id('c1', w.club), 'started', true,
    'identity', jsonb_build_object('sofascoreId', 'S' || p_i, 'flashscoreId', 'F' || p_i),
    'stats', jsonb_build_object('minutes', 90, 'goals', case when p_i = 10 then 1 else 0 end,
      'cleanSheet', w.club = 1, 'goalsConceded', case when w.club = 1 then 0 else 1 end,
      'yellowCards', 0, 'redCards', 0, 'secondYellowDismissals', 0, 'ownGoals', 0,
      'assists', 0, 'penaltiesMissed', 0, 'saves', 0, 'penaltiesSaved', 0),
    'evidence', (select jsonb_object_agg(field, jsonb_build_object('state', 'verified', 'source', 'sofascore+flashscore',
      'observedAt', '2026-08-10T16:00:00Z', 'references', jsonb_build_array('sofascore:event:9001', 'flashscore:match:AbC1')))
      from unnest(array['minutes','goals','cleanSheet','goalsConceded','yellowCards','redCards','secondYellowDismissals',
        'ownGoals','assists','penaltiesMissed','saves','penaltiesSaved']) field)) || p_extra
  from world w where w.i = p_i
$$;
create function pg_temp.request(p_rows jsonb default null, p_extra jsonb default '{}', p_sofa text default '9001',
  p_flash text default 'AbC1') returns jsonb language sql as $$
  select jsonb_build_object('sofascoreEventId', p_sofa, 'flashscoreEventId', p_flash,
    'mappingSnapshotDigest', repeat('ab', 32),
    'payload', jsonb_build_object('homeScore', 1, 'awayScore', 0, 'anonymousStarters', 0, 'anonymousByTeam', '{}'::jsonb,
      'references', jsonb_build_array('sofascore:event:9001', 'flashscore:match:AbC1'),
      'participationComplete', true, 'disciplineComplete', true,
      'players', coalesce(p_rows, (select jsonb_agg(pg_temp.row(i) order by i) from generate_series(1, 22) i))) || p_extra)
$$;
create function pg_temp.code(p_fixture uuid, p_request jsonb, p_dry boolean default false) returns text language plpgsql as $$
begin
  perform api.service_record_reconciled_fantasy_observation(p_fixture, p_request, p_dry);
  return 'ok';
exception when others then return sqlerrm;
end $$;
create function pg_temp.observations() returns integer language sql as
  $$ select count(*)::int from app_private.fantasy_fixture_observations $$;
create function pg_temp.input_version() returns bigint language sql as
  $$ select scoring_input_version from app.fantasy_gameweeks where id = pg_temp.id('c0', 6) $$;

-- ===========================================================================
-- 1. Who may call it
-- ===========================================================================
select extensions.ok(not has_function_privilege('anon', 'api.service_record_reconciled_fantasy_observation(uuid,jsonb,boolean)', 'execute'), '1.1 not callable by visitors');
select extensions.ok(not has_function_privilege('authenticated', 'api.service_record_reconciled_fantasy_observation(uuid,jsonb,boolean)', 'execute'), '1.2 not callable by signed-in users');
select extensions.ok(has_function_privilege('service_role', 'api.service_record_reconciled_fantasy_observation(uuid,jsonb,boolean)', 'execute'), '1.3 callable by the service role');
select extensions.ok(not has_table_privilege('service_role', 'app_private.football_provider_fixture_links', 'insert'), '1.4 the fixture links are written only through the function');
select pg_temp.act('op');
select extensions.throws_ok($$select api.service_record_reconciled_fantasy_observation('f0000000-0000-4000-8000-000000000001', '{}', true)$$,
  'PT403', 'forbidden', '1.5 a non-service caller is refused even with execute');
select pg_temp.act('svc');
select extensions.throws_ok(format($$select api.service_record_fantasy_observation(%L, %L, 'provider-reconciled')$$,
  pg_temp.id('f0', 1), (pg_temp.request() -> 'payload')::text),
  'PT400', 'adaptive_payload_invalid', '1.6 the recorder refuses the reconciled source when called directly (identities would be unchecked)');

-- ===========================================================================
-- 2. Dry run: every guard runs, nothing stays
-- ===========================================================================
select pg_temp.put('v0', pg_temp.input_version()::text);
select pg_temp.put('dry', api.service_record_reconciled_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(), true)::text);
select extensions.is((pg_temp.get('dry')::jsonb ->> 'dryRun')::boolean, true, '2.1 the answer says it was a dry run');
select extensions.ok(pg_temp.get('dry')::jsonb ->> 'digest' ~ '^[0-9a-f]{64}$', '2.2 and gives the digest that would be stored');
select extensions.is((pg_temp.get('dry')::jsonb ->> 'fullReady')::boolean, true, '2.3 and the readiness the recorder computed (full)');
select extensions.is(pg_temp.observations(), 0, '2.4 no observation stays');
select extensions.is((select count(*)::int from app_private.football_provider_fixture_links), 0, '2.5 no fixture link stays');
select extensions.is(pg_temp.input_version()::text, pg_temp.get('v0'), '2.6 the scoring input version did not move');
select extensions.is(coalesce(current_setting('botolago.reconciled_ingestion', true), ''), '', '2.7 the internal flag is cleared');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(null, '{"homeScore": 2}'), true), 'adaptive_final_score_mismatch',
  '2.8 a dry run reports the recorder''s own refusal (wrong final score)');

-- ===========================================================================
-- 3. Record, then retry: the same facts are stored once
-- ===========================================================================
select pg_temp.put('rec', api.service_record_reconciled_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request())::text);
select extensions.is((pg_temp.get('rec')::jsonb ->> 'created')::boolean, true, '3.1 recorded');
select extensions.is(pg_temp.get('rec')::jsonb ->> 'digest', pg_temp.get('dry')::jsonb ->> 'digest', '3.2 the same digest the dry run announced');
select extensions.is((pg_temp.get('rec')::jsonb ->> 'latest')::boolean, true, '3.3 it is the latest observation for the fixture');
select extensions.is((select source from app_private.fantasy_fixture_observations), 'provider-reconciled', '3.4 stored with its own source');
select extensions.is((select payload -> 'sourceRefs' ->> 'sofascoreEventId' from app_private.fantasy_fixture_observations), '9001', '3.5 the provider matches are kept with it');
select extensions.is((select count(*)::int from app_private.football_provider_fixture_links where fixture_id = pg_temp.id('f0', 1)), 2, '3.6 the fixture is linked to one match on each provider');
select extensions.ok(pg_temp.input_version() > pg_temp.get('v0')::bigint, '3.7 the scoring worker is told there is new input');
select pg_temp.put('v1', pg_temp.input_version()::text);
select pg_temp.put('retry', api.service_record_reconciled_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request())::text);
select extensions.is((pg_temp.get('retry')::jsonb ->> 'created')::boolean, false, '3.8 a retry (lost answer) stores nothing new');
select extensions.is(pg_temp.get('retry')::jsonb ->> 'observationId', pg_temp.get('rec')::jsonb ->> 'observationId', '3.9 and returns the same observation');
select extensions.is(pg_temp.observations(), 1, '3.10 one observation in total');
select extensions.is(pg_temp.input_version()::text, pg_temp.get('v1'), '3.11 the scoring input version did not move again');
-- Evidence read later (a different observedAt) is the same facts: still one row.
select extensions.is((api.service_record_reconciled_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(jsonb_set(pg_temp.row(i), '{evidence,minutes,observedAt}', '"2026-08-10T23:00:00Z"') order by i) from generate_series(1, 22) i))) ->> 'created')::boolean,
  false, '3.12 the same facts read again later are not a new observation');
select extensions.is((pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(null, '{}'), false)), 'ok', '3.13 the plain retry still answers ok');

-- ===========================================================================
-- 4. Identities must be reviewed on both providers, and point at the row's player
-- ===========================================================================
select pg_temp.put('n4', pg_temp.observations()::text);
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(case when i = 5 then pg_temp.row(i) - 'identity' else pg_temp.row(i) end order by i) from generate_series(1, 22) i))),
  'reconciled_identity_missing', '4.1 a row without its provider ids is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(case when i = 5 then jsonb_set(pg_temp.row(i), '{identity,flashscoreId}', 'null') else pg_temp.row(i) end order by i) from generate_series(1, 22) i))),
  'reconciled_identity_missing', '4.2 a row reviewed on one provider only is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(case when i = 5 then jsonb_set(pg_temp.row(i), '{identity,flashscoreId}', '"F24"') else pg_temp.row(i) end order by i) from generate_series(1, 22) i))),
  'reconciled_identity_not_reviewed', '4.3 a provider id with no mapping is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(case when i = 5 then jsonb_set(pg_temp.row(i), '{identity,flashscoreId}', '"F6"') else pg_temp.row(i) end order by i) from generate_series(1, 22) i))),
  'reconciled_identity_not_reviewed', '4.4 a reviewed id that belongs to another player is refused');
-- A mapping that is no longer active no longer counts.
update app_private.football_provider_mappings set active = false where provider_name = 'flashscore' and external_id = 'F8';
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(jsonb_set(pg_temp.row(i), '{stats,yellowCards}', (case when i = 3 then '1' else '0' end)::jsonb) order by i) from generate_series(1, 22) i))),
  'reconciled_identity_not_reviewed', '4.6 an inactive mapping is refused');
update app_private.football_provider_mappings set active = true where provider_name = 'flashscore' and external_id = 'F8';
select extensions.is(pg_temp.observations()::text, pg_temp.get('n4'), '4.7 nothing was stored by any refused call');

-- ===========================================================================
-- 5. One provider match per app fixture, one app fixture per provider match
-- ===========================================================================
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(null, '{}', '9002')), 'reconciled_fixture_link_conflict',
  '5.1 the fixture cannot be fed from another Sofascore match');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(null, '{}', '9001', 'XyZ9')), 'reconciled_fixture_link_conflict',
  '5.2 nor from another Flashscore match');
select extensions.is(pg_temp.code(pg_temp.id('f0', 2), pg_temp.request(null, '{"homeScore":0}')), 'reconciled_fixture_link_conflict',
  '5.3 a provider match already linked cannot feed another fixture');
select extensions.is(pg_temp.code(pg_temp.id('f0', 9), pg_temp.request()), 'reconciled_fixture_not_found', '5.4 an unknown fixture is refused');

-- ===========================================================================
-- 6. Facts only: estimates and correction fields stay with a reviewed correction
-- ===========================================================================
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(case when i = 4 then jsonb_set(pg_temp.row(i), '{evidence,minutes,state}', '"estimated"') else pg_temp.row(i) end order by i) from generate_series(1, 22) i))),
  'reconciled_request_invalid', '6.1 an estimated field is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(null, '{"reviewer":"someone"}')), 'reconciled_request_invalid', '6.2 correction fields are refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request() - 'mappingSnapshotDigest'), 'reconciled_request_invalid', '6.3 the snapshot digest is required');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), jsonb_set(pg_temp.request(), '{sofascoreEventId}', '"9001; drop"')), 'reconciled_request_invalid', '6.4 provider match ids are checked');

-- ===========================================================================
-- 7. The recorder's own guards still apply
-- ===========================================================================
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(pg_temp.row(i) order by i) from generate_series(1, 21) i))), 'adaptive_starters_incomplete',
  '7.1 a lineup that is not 11 + 11 is refused');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(case when i = 13 then jsonb_set(pg_temp.row(i), '{teamId}', to_jsonb(pg_temp.id('c1', 1)))
    when i = 5 then jsonb_set(pg_temp.row(i), '{teamId}', to_jsonb(pg_temp.id('c1', 2))) else pg_temp.row(i) end order by i) from generate_series(1, 22) i))),
  'adaptive_player_membership_missing', '7.2 players put on the wrong side (counts still 11 + 11) are refused');

-- ===========================================================================
-- 8. A reviewed correction still wins
-- ===========================================================================
select api.service_record_fantasy_observation(pg_temp.id('f0', 1),
  (pg_temp.request() -> 'payload') - 'players' || jsonb_build_object(
    'players', (select jsonb_agg(pg_temp.row(i) - 'identity' order by i) from generate_series(1, 22) i),
    'reason', 'Reviewed official match sheet', 'reviewer', 'test-reviewer',
    'expectedDigest', pg_temp.get('rec')::jsonb ->> 'digest', 'references', jsonb_build_array('official:sheet:1')),
  'reviewed-correction');
select pg_temp.put('n8', pg_temp.observations()::text);
select extensions.is((api.service_record_reconciled_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(
  (select jsonb_agg(jsonb_set(pg_temp.row(i), '{stats,yellowCards}', (case when i = 3 then '1' else '0' end)::jsonb) order by i) from generate_series(1, 22) i)))
  ->> 'reviewedOverride')::boolean, true, '8.1 after a reviewed correction, new provider facts do not replace it');
select extensions.is(pg_temp.observations()::text, pg_temp.get('n8'), '8.2 and nothing new is stored');

select * from extensions.finish();
rollback;
