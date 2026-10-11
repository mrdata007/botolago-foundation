begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- SofaScore player performances for Pépites
-- (api.service_sync_sofascore_player_performances, 20261011180000). Real
-- functions, synthetic world (the one of sofascore_fantasy_observations.test.sql):
--   1 who may call it   2 refusals before there is anything to derive
--   3 the sweep writes the rows from the observation   4 the Pépites reader sees them
--   5 Fantasy's scoring document does not move   6 the same observation again, and a rating
--   7 a limited-coverage observation replaces the rows, unknown stays NULL
--   8 refusals: identity, another provider's rows, another provider's observation   9 columns

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


-- A third fixture that is not finished yet.
insert into app.fixtures (id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status,
  provider_updated_at, source_sequence)
values (pg_temp.id('f0', 3), pg_temp.id('c0', 2), pg_temp.id('c0', 3), pg_temp.id('c0', 7), pg_temp.id('c1', 1),
  pg_temp.id('c1', 3), '2026-09-20 12:00Z', 'scheduled', '2026-08-01 00:00Z', 1);

create function pg_temp.sync(p_fixture uuid default null, p_ratings jsonb default null) returns jsonb language sql as
  $$ select api.service_sync_sofascore_player_performances(p_fixture, 20, p_ratings) $$;
create function pg_temp.sync_code(p_fixture uuid, p_ratings jsonb default null) returns text language plpgsql as $$
begin
  perform api.service_sync_sofascore_player_performances(p_fixture, 20, p_ratings);
  return 'ok';
exception when others then return sqlerrm;
end $$;
-- The document Fantasy scores from and digests (the snapshot check recomputes it).
create function pg_temp.doc() returns text language sql as $$
  select encode(extensions.digest(app_private.fantasy_scoring_input_document(pg_temp.id('c0', 6))::text, 'sha256'), 'hex')
$$;
create function pg_temp.appearances() returns integer language sql as $$
  select count(*)::int from app_private.pepites_source_appearances(pg_temp.id('c0', 3), 'weekly', 1, now() + interval '1 day')
$$;

-- ===========================================================================
-- 1. Who may call it
-- ===========================================================================
select extensions.ok(not has_function_privilege('anon', 'api.service_sync_sofascore_player_performances(uuid,integer,jsonb)', 'execute'), '1.1 not callable by visitors');
select extensions.ok(not has_function_privilege('authenticated', 'api.service_sync_sofascore_player_performances(uuid,integer,jsonb)', 'execute'), '1.2 not callable by signed-in users');
select extensions.ok(has_function_privilege('service_role', 'api.service_sync_sofascore_player_performances(uuid,integer,jsonb)', 'execute'), '1.3 callable by the service role');
select extensions.ok(not has_function_privilege('service_role', 'app_private.sofascore_sync_fixture_performances(uuid,jsonb)', 'execute'), '1.4 the per-fixture helper is callable by no API role');
select extensions.ok((select p.prosecdef and coalesce(p.proconfig, '{}') && array['search_path=""']
  from pg_proc p where p.oid = 'api.service_sync_sofascore_player_performances(uuid,integer,jsonb)'::regprocedure),
  '1.5 security definer with an empty search_path');
select pg_temp.act('op');
select extensions.throws_ok($$select api.service_sync_sofascore_player_performances()$$, 'PT403', 'forbidden',
  '1.6 a signed-in caller is refused even with execute');
select pg_temp.act('svc');
select extensions.throws_ok($$select api.service_sync_sofascore_player_performances(null, 0)$$, 'PT400', 'sofascore_performances_invalid',
  '1.7 a limit outside 1..50 is refused');
select extensions.throws_ok($$select api.service_sync_sofascore_player_performances(null, 20, '{"1": 7}')$$, 'PT400', 'sofascore_performances_invalid',
  '1.8 ratings are for one fixture only');
select extensions.throws_ok(format($$select api.service_sync_sofascore_player_performances(%L, 20, '{"S1": 11}')$$, pg_temp.id('f0', 1)),
  'PT400', 'sofascore_performances_invalid', '1.9 a rating above 10 is refused');
select extensions.throws_ok(format($$select api.service_sync_sofascore_player_performances(%L, 20, '[7]')$$, pg_temp.id('f0', 1)),
  'PT400', 'sofascore_performances_invalid', '1.10 ratings must be an object');

-- ===========================================================================
-- 2. Refusals before there is anything to derive
-- ===========================================================================
select extensions.is(pg_temp.sync_code(pg_temp.id('f0', 9)), 'sofascore_performances_fixture_not_found', '2.1 an unknown fixture is refused');
select extensions.is(pg_temp.sync_code(pg_temp.id('f0', 3)), 'sofascore_performances_fixture_not_finished', '2.2 an unfinished fixture is refused');
select extensions.is(pg_temp.sync_code(pg_temp.id('f0', 1)), 'sofascore_performances_no_observation', '2.3 a finished fixture with no observation is refused');
select extensions.is(pg_temp.sync() -> 'results', '[]'::jsonb, '2.4 the sweep finds nothing to do');
select extensions.is((select count(*)::int from app.player_fixture_performances), 0, '2.5 nothing was written');

-- ===========================================================================
-- 3. The sweep writes the rows from the observation Fantasy recorded
-- ===========================================================================
select api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(), false);
select pg_temp.put('doc_before', pg_temp.doc());
select pg_temp.put('sweep', pg_temp.sync()::text);
select extensions.is(pg_temp.get('sweep')::jsonb #>> '{results,0,outcome}', 'written', '3.1 the sweep (no fixture named) wrote the fixture');
select extensions.is(jsonb_array_length(pg_temp.get('sweep')::jsonb -> 'results'), 1, '3.2 and only that fixture');
select extensions.is((select count(*)::int from app.player_fixture_performances where active), 22, '3.3 22 active rows: everyone SofaScore says appeared');
select extensions.is((select count(*)::int from app.player_fixture_performances
  where active and source_provider = 'sofascore' and fixture_id = pg_temp.id('f0', 1)), 22, '3.4 all from the sofascore provider, for that fixture');
select extensions.is((select count(distinct source_version)::int from app.player_fixture_performances where active), 1, '3.5 under one source version');
select extensions.is((select min(source_version) from app.player_fixture_performances where active),
  'sofascore-observation:' || (select digest from app_private.fantasy_fixture_observations where fixture_id = pg_temp.id('f0', 1)),
  '3.6 which is the observation digest');
select extensions.is((select min(provider_observed_at) from app.player_fixture_performances where active),
  (select observed_at from app_private.fantasy_fixture_observations where fixture_id = pg_temp.id('f0', 1)), '3.7 observed when the observation was');
select extensions.is((select goals from app.player_fixture_performances where active and player_id = pg_temp.id('a1', 10)), 1, '3.8 the scorer has his goal');
select extensions.is((select sum(goals)::int from app.player_fixture_performances where active), 1, '3.9 and nobody else has one');
select extensions.is((select clean_sheets from app.player_fixture_performances where active and player_id = pg_temp.id('a1', 1)), 1, '3.10 the home goalkeeper has the clean sheet');
select extensions.is((select goals_conceded from app.player_fixture_performances where active and player_id = pg_temp.id('a1', 12)), 1, '3.11 the away goalkeeper conceded one');
select extensions.is((select position::text from app.player_fixture_performances where active and player_id = pg_temp.id('a1', 1)), 'goalkeeper', '3.12 the position is the catalogue position');
select extensions.is((select saves from app.player_fixture_performances where active and player_id = pg_temp.id('a1', 1)), 2, '3.13 a full-coverage goalkeeper has his saves as a fact');
select extensions.is((select count(*)::int from app.player_fixture_performances where active and saves is null), 20, '3.14 an outfield player has none collected (NULL, not zero)');
select extensions.is((select count(*)::int from app.player_fixture_performances where active and assists = 0 and penalties_missed = 0), 22,
  '3.15 assists and penalties missed are facts (0) on a full-coverage match');
select extensions.is((select count(*)::int from app.player_fixture_performances where active and started and appeared and minutes = 90), 22, '3.16 minutes and starts are the observed ones');
select extensions.is((select count(*)::int from app.player_fixture_performances where provider_rating is not null), 0, '3.17 no rating unless the caller gave one');
select extensions.is((select count(*)::int from app_private.historical_performance_fixture_coverage), 0, '3.18 the legacy coverage table is not written');

-- ===========================================================================
-- 4. The Pépites reader sees the appearances
-- ===========================================================================
select extensions.is(pg_temp.appearances(), 22, '4.1 Pépites'' appearance source returns the 22 appearances');
select extensions.is((select sum(goals)::int from app_private.pepites_source_appearances(pg_temp.id('c0', 3), 'weekly', 1, now() + interval '1 day')), 1,
  '4.2 with the goal');
select extensions.is((select saves from app_private.pepites_source_appearances(pg_temp.id('c0', 3), 'weekly', 1, now() + interval '1 day')
  where player_id = pg_temp.id('a1', 1)), 2, '4.3 and the goalkeeper''s saves');

-- ===========================================================================
-- 5. Fantasy's scoring document does not move
-- ===========================================================================
select extensions.is(pg_temp.doc(), pg_temp.get('doc_before'),
  '5.1 the scoring input document is byte for byte the one from before the rows existed (a snapshot digest cannot go stale)');
select extensions.is((app_private.fantasy_scoring_input_document_v1(pg_temp.id('c0', 6)) -> 'fixtures' -> 0 ->> 'activePerformanceCount')::int, 0,
  '5.2 the base document counts no SofaScore row');
update app.player_fixture_performances set source_provider = 'sportsmonks' where active;
select extensions.is((app_private.fantasy_scoring_input_document_v1(pg_temp.id('c0', 6)) -> 'fixtures' -> 0 ->> 'activePerformanceCount')::int, 22,
  '5.3 while the same rows labelled as another provider are counted: the filter is by provider');
update app.player_fixture_performances set source_provider = 'sofascore' where active;
select extensions.is(pg_temp.doc(), pg_temp.get('doc_before'), '5.4 and the document is the same again');

-- ===========================================================================
-- 6. The same observation again, and a rating
-- ===========================================================================
select extensions.is(pg_temp.sync(pg_temp.id('f0', 1)) #>> '{results,0,outcome}', 'unchanged', '6.1 the same observation again writes nothing');
select extensions.is(pg_temp.sync() -> 'results', '[]'::jsonb, '6.2 and the sweep no longer lists the fixture');
select extensions.is((select count(*)::int from app.player_fixture_performances), 22, '6.3 no row was duplicated');
select extensions.is(pg_temp.sync(pg_temp.id('f0', 1), '{"S10": 7.256, "S1": 6.5, "S999": 9}') #>> '{results,0,outcome}', 'rated',
  '6.4 ratings given for the fixture set the rating of the players they name');
select extensions.is((select provider_rating from app.player_fixture_performances where active and player_id = pg_temp.id('a1', 10)), 7.26::numeric,
  '6.5 rounded to two decimals');
select extensions.is((select count(*)::int from app.player_fixture_performances where provider_rating is not null), 2,
  '6.6 an id that is not a row of this fixture rates nobody');
select extensions.is(pg_temp.sync(pg_temp.id('f0', 1), '{"S10": 7.256, "S1": 6.5}') #>> '{results,0,outcome}', 'unchanged', '6.7 the same ratings again change nothing');
select extensions.is(pg_temp.sync(pg_temp.id('f0', 1)) #>> '{results,0,rows}', '22', '6.8 and a call without ratings leaves them');
select extensions.is((select count(*)::int from app.player_fixture_performances where provider_rating is not null), 2, '6.9 where they were');

-- ===========================================================================
-- 7. A limited-coverage observation replaces the rows; unknown stays NULL
-- ===========================================================================
select api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(null, '{}', '9001', false), false);
select pg_temp.put('doc_before', pg_temp.doc());
select pg_temp.put('replace', pg_temp.sync(pg_temp.id('f0', 1))::text);
select extensions.is(pg_temp.get('replace')::jsonb #>> '{results,0,outcome}', 'written', '7.1 the newer observation is written');
select extensions.is(pg_temp.get('replace')::jsonb #>> '{results,0,replaced}', '22', '7.2 and replaces the 22 rows of the older one');
select extensions.is((select count(*)::int from app.player_fixture_performances where active), 22, '7.3 22 active rows');
select extensions.is((select count(*)::int from app.player_fixture_performances where not active), 22, '7.4 the older rows are kept, inactive');
select extensions.is((select count(distinct source_version)::int from app.player_fixture_performances where active), 1, '7.5 the active ones are all of the new version');
select extensions.is((select count(*)::int from app.player_fixture_performances where active and assists is null), 22,
  '7.6 assists are NULL where no incident names an assister (limited coverage)');
select extensions.is((select count(*)::int from app.player_fixture_performances where active and penalties_missed is null), 22,
  '7.7 penalties missed are NULL on a limited-coverage match');
select extensions.is((select count(*)::int from app.player_fixture_performances where active and saves is null and position = 'goalkeeper'), 2,
  '7.8 a goalkeeper''s saves are NULL, not zero');
select extensions.is((select count(*)::int from app.player_fixture_performances where active and penalties_saved is null), 22,
  '7.9 and his penalties saved');
select extensions.is((select count(*)::int from app.player_fixture_performances where active
  and (assists = 0 or saves = 0 or penalties_saved = 0 or penalties_missed = 0)), 0,
  '7.10 no stand-in zero was written for anything unknown');
select extensions.is((select count(*)::int from app.player_fixture_performances where active and started and minutes = 90), 22,
  '7.11 minutes and starts are still facts');
select extensions.is((select count(*)::int from app.player_fixture_performances where active and provider_rating is not null), 0,
  '7.12 the ratings belong to the replaced rows and are given again by the next call');
select extensions.is(pg_temp.appearances(), 22, '7.13 Pépites still sees the 22 appearances');
select extensions.is((select count(*)::int from app_private.pepites_source_appearances(pg_temp.id('c0', 3), 'weekly', 1, now() + interval '1 day')
  where assists is null), 22, '7.14 unknown assists reach its reader as NULL, which it sums null-safely');
select extensions.is(pg_temp.doc(), pg_temp.get('doc_before'), '7.15 the scoring document is again unmoved by the replacement');

-- ===========================================================================
-- 8. Refusals write nothing
-- ===========================================================================
-- 8a. A player who is no longer a reviewed SofaScore identity.
update app_private.football_provider_mappings set external_id = 'S5-moved'
 where provider_name = 'sofascore' and entity_type = 'player' and external_id = 'S5';
select extensions.is(pg_temp.sync_code(pg_temp.id('f0', 1)), 'sofascore_performances_identity_not_reviewed', '8.1 an identity that is not reviewed is refused');
select extensions.is((select count(*)::int from app.player_fixture_performances where active), 22, '8.2 and the rows are as they were');
update app_private.football_provider_mappings set external_id = 'S5'
 where provider_name = 'sofascore' and entity_type = 'player' and external_id = 'S5-moved';
select extensions.is(pg_temp.sync(pg_temp.id('f0', 1)) #>> '{results,0,outcome}', 'unchanged', '8.3 reviewed again, it is unchanged');

-- 8b. The fixture must still be the one the reviewed mapping names.
update app_private.football_provider_mappings set external_id = '9003'
 where provider_name = 'sofascore' and entity_type = 'fixture' and internal_entity_id = pg_temp.id('f0', 1);
select extensions.is(pg_temp.sync_code(pg_temp.id('f0', 1)), 'sofascore_performances_fixture_mapping_missing', '8.4 a fixture whose mapping moved is refused');
update app_private.football_provider_mappings set external_id = '9001'
 where provider_name = 'sofascore' and entity_type = 'fixture' and internal_entity_id = pg_temp.id('f0', 1);

-- 8c. A fixture another provider covers keeps that provider's rows.
update app.player_fixture_performances set source_provider = 'sportsmonks' where active;
select extensions.is(pg_temp.sync_code(pg_temp.id('f0', 1)), 'sofascore_performances_other_provider_rows', '8.5 a fixture with another provider''s active rows is refused');
select extensions.is(pg_temp.sync() -> 'results', '[]'::jsonb, '8.6 and the sweep does not list it');
select extensions.is((select count(*)::int from app.player_fixture_performances where active and source_provider = 'sportsmonks'), 22, '8.7 those rows are untouched');
update app.player_fixture_performances set source_provider = 'sofascore' where active;

-- 8d. Another provider's observation is the newest word: not ours to turn into rows.
insert into app_private.fantasy_fixture_observations (fixture_id, source, digest, payload, full_ready, simple_ready)
values (pg_temp.id('f0', 2), 'sportsmonks', repeat('d', 64), '{"players":[]}', false, false);
select extensions.is(pg_temp.sync_code(pg_temp.id('f0', 2)), 'sofascore_performances_observation_not_sofascore', '8.8 a fixture whose newest observation is not SofaScore''s is refused');
select extensions.is(pg_temp.sync() -> 'results', '[]'::jsonb, '8.9 and the sweep does not list it');

-- ===========================================================================
-- 9. The table and the patched documents
-- ===========================================================================
select extensions.ok(not (select attnotnull from pg_attribute where attrelid = 'app.player_fixture_performances'::regclass and attname = 'assists'),
  '9.1 assists can be NULL');
select extensions.ok(not (select attnotnull from pg_attribute where attrelid = 'app.player_fixture_performances'::regclass and attname = 'penalties_missed'),
  '9.2 penalties missed can be NULL');
select extensions.is((select count(*)::int from information_schema.columns where table_schema = 'app' and table_name = 'player_fixture_performances'), 27,
  '9.3 no column was added (the scoring document digests to_jsonb of a row)');
select extensions.is((length(pg_get_functiondef('app_private.fantasy_scoring_input_document_v1(uuid)'::regprocedure))
  - length(replace(pg_get_functiondef('app_private.fantasy_scoring_input_document_v1(uuid)'::regprocedure), 'p.source_provider is distinct from ''sofascore''', '')))
  / length('p.source_provider is distinct from ''sofascore'''), 3, '9.4 the base scoring document filters SofaScore rows in its three places');
select extensions.is((length(pg_get_functiondef('app_private.fantasy_validate_scoring_document_v1(jsonb)'::regprocedure))
  - length(replace(pg_get_functiondef('app_private.fantasy_validate_scoring_document_v1(jsonb)'::regprocedure), 'p.source_provider is distinct from ''sofascore''', '')))
  / length('p.source_provider is distinct from ''sofascore'''), 1, '9.5 and the legacy fixture check in its one');

select * from extensions.finish();
rollback;
