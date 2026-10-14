begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- Second SofaScore ids of a catalog player, and the staff actions of the review list
-- (20261014170000). Real functions, synthetic world (the one of sofascore_player_performances.test.sql,
-- its season made current so players can be created):
--   1 the alias table and its rules   2 the identity every reader uses (and the Fantasy context)
--   3 the Fantasy recorder and the performances sync accept an alias   4 the matcher never creates
--   or re-matches an alias   5 who may call the staff actions   6 options   7 "link as second ID"
--   8 "create this player from SofaScore"

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
create function pg_temp.sync(p_fixture uuid default null, p_ratings jsonb default null) returns jsonb language sql as
  $$ select api.service_sync_sofascore_player_performances(p_fixture, 20, p_ratings) $$;
create function pg_temp.sync_code(p_fixture uuid, p_ratings jsonb default null) returns text language plpgsql as $$
begin
  perform api.service_sync_sofascore_player_performances(p_fixture, 20, p_ratings);
  return 'ok';
exception when others then return sqlerrm;
end $$;
create function pg_temp.mapped_to(p_sid text) returns uuid language sql as $$
  select internal_entity_id from app_private.football_provider_mappings
   where provider_name = 'sofascore' and entity_type = 'player' and external_id = p_sid $$;
create function pg_temp.map_id(p_sid text) returns uuid language sql as $$
  select id from app_private.football_provider_mappings
   where provider_name = 'sofascore' and entity_type = 'player' and external_id = p_sid $$;


-- A second staff member with no football permission, and the operator in an aal1 session.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.id('e1', 2), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'sca-ed@example.test', 'hash', now(), '{}', '{"username":"sca_ed"}', now(), now());
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (pg_temp.id('e3', 2), pg_temp.id('e1', 2), 'TOTP', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at) values (pg_temp.id('e2', 2), pg_temp.id('e1', 2), now());
insert into app_private.staff_principals (auth_user_id) values (pg_temp.id('e1', 2));
insert into app_private.staff_role_assignments (staff_principal_id, role_id, grant_reason)
select sp.id, r.id, 'Editor for the SofaScore catalog aliases test.'
from app_private.staff_principals sp, app_private.admin_roles r
where sp.auth_user_id = pg_temp.id('e1', 2) and r.name = 'editor';
create function pg_temp.as_(p_who text) returns void language plpgsql as $$
begin
  if p_who = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  elsif p_who = 'op1' then
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('e1', 1), 'role', 'authenticated',
      'aal', 'aal1', 'session_id', pg_temp.id('e2', 1))::text, true);
  elsif p_who = 'ed' then
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('e1', 2), 'role', 'authenticated',
      'aal', 'aal2', 'session_id', pg_temp.id('e2', 2))::text, true);
  else
    perform pg_temp.act(p_who);
  end if;
end $$;
create function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
create function pg_temp.ident(p_id text) returns jsonb language sql as
  $$ select app_private.sofascore_player_identity(p_id) $$;
create function pg_temp.ctx(p_ids text[]) returns jsonb language plpgsql as $$
begin
  perform pg_temp.act('svc');
  return api.service_sofascore_fantasy_context(pg_temp.id('f0', 1), p_ids) -> 'players';
end $$;
create function pg_temp.with_alias_row(p_alias text) returns jsonb language sql as $$
  select jsonb_agg(case when i = 5 then pg_temp.row(5) || jsonb_build_object('identity', jsonb_build_object('sofascoreId', p_alias))
                        else pg_temp.row(i) end order by i) from generate_series(1, 22) i $$;
create function pg_temp.staff() returns uuid language sql as $$ select pg_temp.id('e1', 1) $$;
-- The matcher and the staff actions create players only in the current season.
update app.seasons set is_current = true where id = pg_temp.id('c0', 3);

-- ===========================================================================
-- 1. The table and its rules
-- ===========================================================================
select extensions.ok(not has_table_privilege('authenticated', 'app_private.sofascore_player_aliases', 'select')
  and not has_table_privilege('anon', 'app_private.sofascore_player_aliases', 'select')
  and not has_table_privilege('service_role', 'app_private.sofascore_player_aliases', 'select')
  and (select relforcerowsecurity from pg_class where oid = 'app_private.sofascore_player_aliases'::regclass),
  '1.1 the alias table is private: no API role reads it, row level security forced');
select extensions.ok((select bool_and(not has_function_privilege(r, f, 'execute'))
  from unnest(array['anon', 'authenticated', 'service_role']) r,
       unnest(array['app_private.sofascore_player_identity(text)', 'app_private.sofascore_link_alias(text,uuid,uuid,jsonb)',
                    'app_private.sofascore_create_catalog_player(uuid,uuid,text,integer,text)',
                    'app_private.sofascore_player_alias_ids(uuid)', 'app_private.sofascore_queue_create_season(text)']) f),
  '1.2 the internal functions are callable by no API role');
select extensions.is(pg_temp.ident('S5') ->> 'appPlayerId', pg_temp.id('a1', 5)::text, '1.3 a main id resolves to its player');
select extensions.is(pg_temp.ident('S5') ->> 'alias', 'false', '1.4 and says it is no alias');
select extensions.is(pg_temp.ident('A5'), null::jsonb, '1.5 an unknown id resolves to nothing');
select extensions.is(pg_temp.err(format($$select app_private.sofascore_link_alias('A5', %L, %L)$$, pg_temp.id('a1', 24), pg_temp.staff())),
  'sofascore_alias_needs_primary', '1.6 a player without a main link cannot take a second id');
select extensions.is(pg_temp.err(format($$select app_private.sofascore_link_alias('S6', %L, %L)$$, pg_temp.id('a1', 5), pg_temp.staff())),
  'sofascore_mapping_conflict', '1.7 a main id of another player cannot become an alias');
select pg_temp.put('link', app_private.sofascore_link_alias('A5', pg_temp.id('a1', 5), pg_temp.staff(),
  '{"source":"pgtap"}')::text);
select extensions.is(pg_temp.get('link')::jsonb ->> 'primarySofascoreId', 'S5', '1.8 A5 is linked as a second id of the player whose main id is S5');
select extensions.is((select count(*)::int from app_private.sofascore_player_aliases where sofascore_player_id = 'A5' and player_id = pg_temp.id('a1', 5)),
  1, '1.9 one alias row');
select extensions.is((select row(method, decided_by, player_id, mapping_id = pg_temp.map_id('S5'))::text
  from app_private.sofascore_player_match_log where id = (pg_temp.get('link')::jsonb ->> 'logId')::uuid),
  row('staff-alias', pg_temp.staff(), pg_temp.id('a1', 5), true)::text, '1.10 logged as staff-alias, with the staff user and the main link');
select extensions.is((app_private.sofascore_link_alias('A5', pg_temp.id('a1', 5), pg_temp.staff()) ->> 'alreadyLinked'), 'true',
  '1.11 linking it again changes nothing');
select extensions.is(pg_temp.err(format($$select app_private.sofascore_link_alias('A5', %L, %L)$$, pg_temp.id('a1', 6), pg_temp.staff())),
  'sofascore_mapping_conflict', '1.12 an alias belongs to one player only');
-- The mapping table gets no trigger (its structure is fixed): a mapping written for an alias id around
-- every check makes the id a conflict, unusable either way, instead of a silent second reading.
create function pg_temp.conflict_probe() returns void language plpgsql as $$
begin
  insert into app_private.football_provider_mappings (provider_name, entity_type, external_id,
    internal_entity_id, source_version, last_seen_at) values ('sofascore', 'player', 'A5', pg_temp.id('a1', 24), 'test', now());
  raise exception '%', (select row(s ->> 'conflict', s ->> 'active', s ->> 'reviewed')::text
                          from (select app_private.sofascore_player_identity('A5') s) x);
end $$;
select extensions.is(pg_temp.err('select pg_temp.conflict_probe()'), '(true,false,false)',
  '1.13 an id that is both a mapping and an alias resolves to nobody usable (fails closed)');
select extensions.is(pg_temp.ident('A5') ->> 'active', 'true', '1.14 (the probe rolled back: A5 is the alias again)');
select extensions.is((select count(*)::int from pg_trigger
  where tgrelid = 'app_private.football_provider_mappings'::regclass and not tgisinternal), 2,
  '1.14b the mapping table keeps its two original triggers');
select extensions.is(pg_temp.err(format($$insert into app_private.sofascore_player_aliases (sofascore_player_id, player_id, log_id)
  values ('S7', %L, %L)$$, pg_temp.id('a1', 24), (pg_temp.get('link')::jsonb ->> 'logId'))),
  'sofascore_alias_conflict', '1.15 an alias cannot take a mapped id, even written directly');
select extensions.is(pg_temp.err($$delete from app_private.sofascore_player_aliases where sofascore_player_id = 'A5'$$),
  'sofascore_alias_immutable', '1.16 an alias is never deleted');
select extensions.is(pg_temp.err(format($$update app_private.sofascore_player_aliases set player_id = %L where sofascore_player_id = 'A5'$$,
  pg_temp.id('a1', 6))), 'sofascore_alias_immutable', '1.17 nor moved to another player');
select extensions.is(pg_temp.err(format($$insert into app_private.sofascore_player_match_log (method, mapping_id, sofascore_player_id, player_id)
  values ('staff-alias', %L, 'A99', %L)$$, pg_temp.map_id('S5'), pg_temp.id('a1', 5))),
  'new row for relation "sofascore_player_match_log" violates check constraint "sofascore_player_match_log_staff_check"',
  '1.18 a staff-alias log row needs the staff user');
select extensions.is(app_private.sofascore_player_alias_ids(pg_temp.id('a1', 5)), '["A5"]'::jsonb, '1.19 the player lists his second ids');

-- ===========================================================================
-- 2. id -> player: the identity every reader uses
-- ===========================================================================
select extensions.is((select row(s ->> 'appPlayerId', s ->> 'active', s ->> 'reviewed', s ->> 'alias', s ->> 'primaryExternalId',
    s ->> 'mappingId', s ->> 'reviewProvenance')::text from pg_temp.ident('A5') s),
  row(pg_temp.id('a1', 5)::text, 'true', 'true', 'true', 'S5', pg_temp.map_id('S5')::text, 'staff_alias')::text,
  '2.1 the alias is the player of the main link, active and reviewed');
select extensions.is(pg_temp.ident('S5') - 'alias', app_private.football_mapping_supporting_state(pg_temp.map_id('S5')),
  '2.2 a main id answers exactly what football_mapping_supporting_state answers');
select extensions.is((select jsonb_agg(p ->> 'externalId' order by p ->> 'externalId') from jsonb_array_elements(pg_temp.ctx(array['S5', 'A5', 'S24', 'NOPE'])) p),
  '["A5", "S5"]'::jsonb, '2.3 the Fantasy context answers both ids, and nothing for unknown ones');
select extensions.is((select row(p ->> 'appPlayerId', p ->> 'active', p ->> 'reviewed', p ->> 'version')::text
  from jsonb_array_elements(pg_temp.ctx(array['A5'])) p),
  row(pg_temp.id('a1', 5)::text, 'true', 'true', 'sofascore-alias:' || (pg_temp.get('link')::jsonb ->> 'logId'))::text,
  '2.4 the alias row of the context names the player, active, reviewed, with its own version');
select extensions.is((select p - 'updatedAt' from jsonb_array_elements(pg_temp.ctx(array['S5'])) p),
  jsonb_build_object('id', pg_temp.map_id('S5'), 'externalId', 'S5', 'appPlayerId', pg_temp.id('a1', 5),
    'active', true, 'reviewed', true,
    'version', (select source_version from app_private.football_provider_mappings where id = pg_temp.map_id('S5'))),
  '2.5 a main id''s context row is what it was before');

-- The alias is only as good as the main link: switch the main link off, it is inactive too.
update app_private.football_provider_mappings set active = false where id = pg_temp.map_id('S5');
select extensions.is(pg_temp.ident('A5') ->> 'active', 'false', '2.6 main link off: the alias is inactive');
update app_private.football_provider_mappings set active = true where id = pg_temp.map_id('S5');
update app_private.sofascore_player_aliases set active = false where sofascore_player_id = 'A5';
select extensions.is(pg_temp.ident('A5') ->> 'active', 'false', '2.7 alias off: inactive');
select extensions.is(app_private.sofascore_player_alias_ids(pg_temp.id('a1', 5)), '[]'::jsonb, '2.8 and no longer listed');
update app_private.sofascore_player_aliases set active = true where sofascore_player_id = 'A5';
-- A proof that does not agree is no proof: an alias row pointing at another decision's log row.
insert into app_private.sofascore_player_match_log (id, method, mapping_id, sofascore_player_id, player_id, decided_by)
values (pg_temp.id('d0', 1), 'staff-resolution', pg_temp.map_id('S6'), 'A6', pg_temp.id('a1', 6), pg_temp.staff());
insert into app_private.sofascore_player_aliases (sofascore_player_id, player_id, log_id) values ('A6', pg_temp.id('a1', 6), pg_temp.id('d0', 1));
select extensions.is((select row(s ->> 'active', s ->> 'reviewed')::text from pg_temp.ident('A6') s), row('true', 'false')::text,
  '2.9 an alias whose log row is not its staff-alias decision is not reviewed');

-- ===========================================================================
-- 3. The Fantasy recorder and the performances sync accept an alias
-- ===========================================================================
select pg_temp.act('svc');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(pg_temp.with_alias_row('A6')), true),
  'sofascore_identity_not_reviewed', '3.1 an unreviewed alias is refused, like an unreviewed mapping');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(pg_temp.with_alias_row('A7')), true),
  'sofascore_identity_not_reviewed', '3.2 an alias of another player is refused (the row names player 5)');
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(pg_temp.with_alias_row('UNKNOWN5')), true),
  'sofascore_identity_not_reviewed', '3.3 an unknown id is refused');
update app_private.sofascore_player_aliases set active = false where sofascore_player_id = 'A5';
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(pg_temp.with_alias_row('A5')), true),
  'sofascore_identity_not_reviewed', '3.4 a switched-off alias is refused');
update app_private.sofascore_player_aliases set active = true where sofascore_player_id = 'A5';
select extensions.is(pg_temp.code(pg_temp.id('f0', 1), pg_temp.request(pg_temp.with_alias_row('A5')), true), 'ok',
  '3.5 player 5 under his second id passes (dry run)');
select api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(pg_temp.with_alias_row('A5')), false);
select extensions.is(pg_temp.observations(), 1, '3.6 the observation is recorded');
select extensions.is((select p #>> '{identity,sofascoreId}' from app_private.fantasy_fixture_observations o,
  jsonb_array_elements(o.payload -> 'players') p where p ->> 'playerId' = pg_temp.id('a1', 5)::text), 'A5',
  '3.7 with the id SofaScore used, for player 5');
select pg_temp.put('sweep', pg_temp.sync(pg_temp.id('f0', 1), '{"A5": 7.4}')::text);
select extensions.is(pg_temp.get('sweep')::jsonb #>> '{results,0,outcome}', 'written', '3.8 the performances sync writes the fixture');
select extensions.is((select row(minutes, provider_rating)::text from app.player_fixture_performances
  where active and player_id = pg_temp.id('a1', 5)), row(90, 7.40)::text, '3.9 player 5 has his row and the rating given under his second id');
-- The sync re-checks every identity: an alias switched off afterwards stops it.
update app_private.sofascore_player_aliases set active = false where sofascore_player_id = 'A5';
select extensions.is(pg_temp.sync_code(pg_temp.id('f0', 1)), 'sofascore_performances_identity_not_reviewed',
  '3.10 the sync refuses once the alias is switched off');
update app_private.sofascore_player_aliases set active = true where sofascore_player_id = 'A5';
-- An alias is never an "unmapped substitute" (the exclusion is for ids nobody has).
select extensions.is(pg_temp.code(pg_temp.id('f0', 2), jsonb_build_object('sofascoreEventId', '9002',
    'mappingSnapshotDigest', repeat('ab', 32), 'coverage', 'full',
    'payload', jsonb_build_object('homeScore', 0, 'awayScore', 0, 'anonymousStarters', 0, 'anonymousByTeam', '{}'::jsonb,
      'participationComplete', true, 'disciplineComplete', true, 'squadCompleteExceptExcluded', true,
      'excludedUnmappedPlayers', jsonb_build_array(jsonb_build_object('sofascoreId', 'A5', 'side', 'away', 'reason', 'no_candidate')),
      'players', '[]'::jsonb)), true),
  'sofascore_unmapped_exclusion_refused', '3.11 an alias cannot be left out as an unmapped substitute');

-- ===========================================================================
-- 4. The matcher: an alias is a player it already knows
-- ===========================================================================
create function pg_temp.pl(p_sid text, p_name text, p_side text default 'home', p_shirt integer default null,
  p_pos text default null, p_appeared boolean default true) returns jsonb language sql as $$
  select jsonb_build_object('sofascorePlayerId', p_sid, 'side', p_side, 'name', p_name, 'shortName', null,
    'shirtNumber', p_shirt, 'position', p_pos, 'appeared', p_appeared) $$;
select pg_temp.put('players', (select count(*) from app.players)::text);
select pg_temp.put('pool', (select count(*) from app.fantasy_players)::text);
select pg_temp.act('svc');
-- Shirt 77 at club 1: nobody has it, so a new id would be CREATED. A5 must not be.
select pg_temp.put('am', api.service_sofascore_auto_map_players(pg_temp.id('f0', 1),
  jsonb_build_array(pg_temp.pl('A5', 'Second Profile Name', 'home', 77, 'D')))::text);
select extensions.is(pg_temp.get('am')::jsonb -> 'mapped', jsonb_build_array(jsonb_build_object('sofascorePlayerId', 'A5',
  'playerId', pg_temp.id('a1', 5))), '4.1 the matcher returns the alias as player 5');
select extensions.is((pg_temp.get('am')::jsonb ->> 'created')::int, 0, '4.2 and creates nobody');
select extensions.is((select count(*) from app.players)::text, pg_temp.get('players'), '4.3 no new player');
select extensions.is((select count(*) from app.fantasy_players)::text, pg_temp.get('pool'), '4.4 no new pool entry');
select extensions.is(pg_temp.map_id('A5'), null::uuid, '4.5 no mapping for the alias id');
select extensions.is((select count(*)::int from app_private.sofascore_player_match_queue where sofascore_player_id = 'A5' and resolved_at is null),
  0, '4.6 nothing queued');
-- Switched off: he is held for staff (inactive_mapping_exists), and still not created.
update app_private.sofascore_player_aliases set active = false where sofascore_player_id = 'A5';
select pg_temp.put('am', api.service_sofascore_auto_map_players(pg_temp.id('f0', 1),
  jsonb_build_array(pg_temp.pl('A5', 'Second Profile Name', 'home', 77, 'D')))::text);
select extensions.is((pg_temp.get('am')::jsonb ->> 'created')::int, 0, '4.7 a switched-off alias is not created either');
select extensions.is((select reason from app_private.sofascore_player_match_queue where sofascore_player_id = 'A5'),
  'inactive_mapping_exists', '4.8 it is queued as an inactive link');
update app_private.sofascore_player_aliases set active = true where sofascore_player_id = 'A5';
select pg_temp.put('am', api.service_sofascore_auto_map_players(pg_temp.id('f0', 1),
  jsonb_build_array(pg_temp.pl('A5', 'Second Profile Name', 'home', 77, 'D')))::text);
select extensions.ok((select resolved_player_id = pg_temp.id('a1', 5) from app_private.sofascore_player_match_queue
  where sofascore_player_id = 'A5'), '4.9 switched on again, the next call closes the entry');
-- A new id at shirt 77 IS created, through the shared creation function: same pool entry and price as before.
select pg_temp.put('am', api.service_sofascore_auto_map_players(pg_temp.id('f0', 1),
  jsonb_build_array(pg_temp.pl('NEW77', 'Brand New Player', 'home', 77, 'D')))::text);
select extensions.is((pg_temp.get('am')::jsonb ->> 'created')::int, 1, '4.10 an unknown id with nobody to match is still created');
select extensions.is((select row(fp.price = round(app_private.fantasy_initial_price_v1('DEF', 6.0, 0.0), 1), fp.status::text, fp.eligible, mem.shirt_number, mem.season_id = pg_temp.id('c0', 3),
    (app_private.football_mapping_supporting_state(pg_temp.map_id('NEW77')) ->> 'reviewProvenance'))::text
  from app.fantasy_players fp join app.team_memberships mem on mem.player_id = fp.football_player_id
  where fp.football_player_id = pg_temp.mapped_to('NEW77')),
  row(true, 'available', true, 77, true, 'automatic_sofascore_created')::text,
  '4.11 with his membership, his priced pool entry and his reviewed link, as before');

-- ===========================================================================
-- 5. Staff actions: who may call them
-- ===========================================================================
select extensions.ok((select bool_and(has_function_privilege('authenticated', f, 'execute')
    and not has_function_privilege('anon', f, 'execute') and not has_function_privilege('service_role', f, 'execute'))
  from unnest(array['api.admin_sofascore_player_link_options(text,text)', 'api.admin_sofascore_link_alias(text,uuid)',
                    'api.admin_sofascore_create_player(text,text,integer,text)']) f),
  '5.1 the three staff RPCs: authenticated only, never anon or the service role');
select extensions.ok((select bool_and(p.prosecdef and coalesce(p.proconfig, '{}') && array['search_path=""'])
  from pg_proc p where p.oid in ('api.admin_sofascore_player_link_options(text,text)'::regprocedure,
    'api.admin_sofascore_link_alias(text,uuid)'::regprocedure, 'api.admin_sofascore_create_player(text,text,integer,text)'::regprocedure)),
  '5.2 security definer with an empty search_path');
-- Two list entries at club 2 (away in both fixtures): a newcomer and a second profile of player 13.
select app_private.sofascore_player_match_enqueue('Q1', pg_temp.id('f0', 2), pg_temp.id('c1', 2), 'away', 'Felipe Exemplo', null,
  45, 'midfielder', 'no_candidate', '{}');
select app_private.sofascore_player_match_enqueue('Q2', pg_temp.id('f0', 2), pg_temp.id('c1', 2), 'away', 'Second Profile Thirteen', null,
  13, 'defender', 'candidate_already_mapped', array[pg_temp.id('a1', 13)]);
select app_private.sofascore_player_match_enqueue('Q3', null, null, null, 'Nobody Known', null, null, null, 'no_shirt', '{}');
-- A held match of club 2 with a long back-off.
insert into app_private.sofascore_fantasy_attempts (fixture_id, sofascore_event_id, status, attempts, last_attempt_at,
  next_retry_at, last_outcome)
values (pg_temp.id('f0', 2), '9002', 'held', 9, statement_timestamp(), statement_timestamp() + interval '5 hours', 'unmapped_players');
create function pg_temp.reheld() returns void language sql as $$
  update app_private.sofascore_fantasy_attempts set status = 'held', attempts = 9,
    next_retry_at = statement_timestamp() + interval '5 hours', last_outcome = 'unmapped_players'
  where fixture_id = pg_temp.id('f0', 2) $$;
create function pg_temp.reopened() returns boolean language sql as $$
  select attempts = 0 and next_retry_at <= statement_timestamp() from app_private.sofascore_fantasy_attempts
   where fixture_id = pg_temp.id('f0', 2) $$;

select pg_temp.as_('anon');
select extensions.is(pg_temp.err($$select api.admin_sofascore_link_alias('Q2', '00000000-0000-4000-8000-000000000001')$$),
  'staff_access_denied', '5.3 a visitor is refused');
select pg_temp.as_('ed');
select extensions.is(pg_temp.err(format($$select api.admin_sofascore_link_alias('Q2', %L)$$, pg_temp.id('a1', 13))),
  'permission_missing', '5.4 staff without the mapping permission cannot link');
select extensions.is(pg_temp.err($$select api.admin_sofascore_create_player('Q1')$$),
  'permission_missing', '5.5 nor create');
select extensions.is(pg_temp.err($$select api.admin_sofascore_player_link_options('Q1')$$),
  'permission_missing', '5.6 nor read the options');
select pg_temp.as_('op1');
select extensions.is(pg_temp.err(format($$select api.admin_sofascore_link_alias('Q2', %L)$$, pg_temp.id('a1', 13))),
  'mfa_assurance_insufficient', '5.7 the operator without the second factor (aal1) is refused');
select extensions.is(pg_temp.err($$select api.admin_sofascore_create_player('Q1')$$),
  'mfa_assurance_insufficient', '5.8 for creating too');
select extensions.is((select count(*)::int from app_private.sofascore_player_aliases where sofascore_player_id = 'Q2'), 0,
  '5.9 nothing was written by a refused call');

-- ===========================================================================
-- 6. Options: the club squad, or the catalog by name
-- ===========================================================================
select pg_temp.as_('op');
select pg_temp.put('opt', api.admin_sofascore_player_link_options('Q2')::text);
select extensions.is((select count(*)::int from jsonb_array_elements(pg_temp.get('opt')::jsonb -> 'players') p where (p ->> 'inClub')::boolean),
  12, '6.1 no query: the club''s squad this season (players 12 to 22 and 24)');
select extensions.is((select row(p ->> 'sofascoreId', p ->> 'sofascoreActive', p ->> 'shirtNumber', p ->> 'teamName')::text
  from jsonb_array_elements(pg_temp.get('opt')::jsonb -> 'players') p where p ->> 'playerId' = pg_temp.id('a1', 13)::text),
  row('S13', 'true', '13', 'Sfs Club 2')::text, '6.2 each with his SofaScore id, shirt and club');
select extensions.is((select p ->> 'sofascoreId' from jsonb_array_elements(pg_temp.get('opt')::jsonb -> 'players') p
  where p ->> 'playerId' = pg_temp.id('a1', 24)::text), null, '6.3 a player with no SofaScore link says so');
select pg_temp.put('opt', api.admin_sofascore_player_link_options('Q2', 'Sfs Player 5')::text);
select extensions.is((select p -> 'sofascoreAliasIds' from jsonb_array_elements(pg_temp.get('opt')::jsonb -> 'players') p
  where p ->> 'playerId' = pg_temp.id('a1', 5)::text), '["A5"]'::jsonb, '6.4 a name search reaches another club, with second ids');
select extensions.is((select bool_and(not (p ->> 'inClub')::boolean) from jsonb_array_elements(pg_temp.get('opt')::jsonb -> 'players') p
  where p ->> 'playerId' = pg_temp.id('a1', 5)::text), true, '6.5 and marks him outside the club');
select extensions.is(jsonb_array_length(api.admin_sofascore_player_link_options('Q2', '100%_') -> 'players'), 0,
  '6.6 % and _ in the query are letters, not wildcards');
select extensions.is(pg_temp.err($$select api.admin_sofascore_player_link_options('Q2', 'x')$$), 'invalid_resolution',
  '6.7 a one-letter query is refused');
select extensions.is(pg_temp.err($$select api.admin_sofascore_player_link_options('NOPE')$$), 'queue_entry_not_found',
  '6.8 an id not on the list is refused');
select extensions.is((select jsonb_object_agg(e ->> 'sofascorePlayerId', e -> 'canCreate') from jsonb_array_elements(api.admin_sofascore_player_match_queue()) e
  where e ->> 'sofascorePlayerId' in ('Q1', 'Q2', 'Q3')), '{"Q1": true, "Q2": true, "Q3": false}'::jsonb,
  '6.9 the list says where "create" can be offered (a club, a position, a current season)');
select extensions.is((select c -> 'sofascoreAliasIds' from jsonb_array_elements(api.admin_sofascore_player_match_queue()) e,
  jsonb_array_elements(e -> 'candidates') c where e ->> 'sofascorePlayerId' = 'Q2'), '[]'::jsonb,
  '6.10 the candidates carry their second ids');

-- ===========================================================================
-- 7. "Link as second ID"
-- ===========================================================================
select extensions.is(pg_temp.err(format($$select api.admin_sofascore_link_alias('Q2', %L)$$, pg_temp.id('a1', 24))),
  'sofascore_alias_needs_primary', '7.1 a player with no main link is refused (link him the ordinary way)');
select app_private.sofascore_player_match_enqueue('A6', pg_temp.id('f0', 2), pg_temp.id('c1', 2), 'away', 'Alias Six', null,
  6, 'defender', 'no_candidate', '{}');
select extensions.is(pg_temp.err(format($$select api.admin_resolve_sofascore_player_match('A6', %L)$$, pg_temp.id('a1', 24))),
  'sofascore_mapping_conflict', '7.2 the ordinary resolution refuses an id that is a second id');
select pg_temp.put('al', api.admin_sofascore_link_alias('Q2', pg_temp.id('a1', 13))::text);
select extensions.is((select row(a ->> 'primarySofascoreId', a ->> 'alreadyLinked', a ->> 'queueClosed')::text from (select pg_temp.get('al')::jsonb a) x),
  row('S13', 'false', '1')::text, '7.3 Q2 is a second id of player 13; the list entry is closed');
select extensions.is((select row(resolved_by, resolved_player_id)::text from app_private.sofascore_player_match_queue where sofascore_player_id = 'Q2'),
  row(pg_temp.staff(), pg_temp.id('a1', 13))::text, '7.4 closed by the staff user, on player 13');
select extensions.is((select row(method, decided_by, evidence ->> 'source', evidence ->> 'sofascoreName')::text
  from app_private.sofascore_player_match_log where sofascore_player_id = 'Q2'),
  row('staff-alias', pg_temp.staff(), 'admin-review-list', 'Second Profile Thirteen')::text, '7.5 audited in the match log with the staff user');
select extensions.ok(pg_temp.reopened(), '7.6 the club''s held match is set to be tried again now');
select extensions.is((select row(s ->> 'appPlayerId', s ->> 'reviewed')::text from pg_temp.ident('Q2') s),
  row(pg_temp.id('a1', 13)::text, 'true')::text, '7.7 and the second id counts as reviewed for Fantasy');
select extensions.is(api.admin_sofascore_link_alias('Q2', pg_temp.id('a1', 13)) ->> 'alreadyLinked', 'true',
  '7.8 the same click again changes nothing');
select extensions.is(pg_temp.err(format($$select api.admin_sofascore_link_alias('Q2', %L)$$, pg_temp.id('a1', 14))),
  'queue_entry_already_resolved', '7.9 another player for a closed entry is refused');
select extensions.is(pg_temp.err(format($$select api.admin_resolve_sofascore_player_match('Q1', %L)$$, pg_temp.id('a1', 24))),
  'ok', '7.10 (control) the ordinary resolution still links a player with no link');
-- That undid Q1; put it back for section 8 under a new id.
select app_private.sofascore_player_match_enqueue('Q4', pg_temp.id('f0', 2), pg_temp.id('c1', 2), 'away', 'Felipe Exemplo', null,
  45, 'midfielder', 'no_candidate', '{}');
select extensions.is(pg_temp.err(format($$select api.admin_resolve_sofascore_player_match('Q4', %L)$$, pg_temp.id('a1', 13))),
  'sofascore_mapping_conflict', '7.11 the ordinary resolution refuses a player who already has a link');

-- ===========================================================================
-- 8. "Create this player from SofaScore"
-- ===========================================================================
select pg_temp.reheld();
select pg_temp.put('players', (select count(*) from app.players)::text);
select extensions.is(pg_temp.err($$select api.admin_sofascore_create_player('Q3')$$), 'sofascore_create_no_club',
  '8.1 an entry with no club cannot be created');
select extensions.is(pg_temp.err($$select api.admin_sofascore_create_player('Q4', p_position => 'striker')$$), 'invalid_resolution',
  '8.2 a position that is not one of the four is refused');
select extensions.is(pg_temp.err($$select api.admin_sofascore_create_player('Q4', p_shirt_number => 100)$$), 'invalid_resolution',
  '8.3 a shirt above 99 is refused');
select extensions.is((select count(*) from app.players)::text, pg_temp.get('players'), '8.4 refused calls created nobody');
select pg_temp.put('cr', api.admin_sofascore_create_player('Q4', 'Felipe Exemplo Jr', 46)::text);
select pg_temp.put('np', pg_temp.get('cr')::jsonb ->> 'playerId');
select extensions.is((select row(full_name, position::text)::text from app.players where id = pg_temp.get('np')::uuid),
  row('Felipe Exemplo Jr', 'midfielder')::text, '8.5 the player exists with the corrected name and the entry''s position');
select extensions.is((select row(team_id, season_id, shirt_number, valid_from, valid_to, active)::text from app.team_memberships
  where player_id = pg_temp.get('np')::uuid),
  row(pg_temp.id('c1', 2), pg_temp.id('c0', 3), 46, '2026-08-01'::date, '2027-06-30'::date, true)::text,
  '8.6 a member of the entry''s club for the whole current season, with the shirt given');
select extensions.is((select row(price = round(app_private.fantasy_initial_price_v1('MID', 6.0, 0.0), 1), status::text, eligible, active)::text
  from app.fantasy_players where football_player_id = pg_temp.get('np')::uuid),
  row(true, 'available', true, true)::text,
  '8.7 in the Fantasy pool at the initial price, like a player the matcher creates');
select extensions.is((select row(s ->> 'reviewed', s ->> 'reviewProvenance', s ->> 'appPlayerId', s ->> 'manuallyCorrected')::text
  from pg_temp.ident('Q4') s), row('true', 'staff_resolution', pg_temp.get('np'), 'true')::text,
  '8.8 linked as a reviewed staff resolution');
select extensions.is((select row(method, decided_by, evidence ->> 'action', evidence ->> 'queueReason')::text
  from app_private.sofascore_player_match_log where sofascore_player_id = 'Q4'),
  row('staff-resolution', pg_temp.staff(), 'create', 'no_candidate')::text, '8.9 audited with the staff user');
select extensions.is((select row(resolved_by, resolved_player_id)::text from app_private.sofascore_player_match_queue where sofascore_player_id = 'Q4'),
  row(pg_temp.staff(), pg_temp.get('np')::uuid)::text, '8.10 the list entry is closed');
select extensions.ok(pg_temp.reopened(), '8.11 the club''s held match is set to be tried again now');
select extensions.is(pg_temp.err($$select api.admin_sofascore_create_player('Q4')$$), 'queue_entry_already_resolved',
  '8.12 creating him twice is refused');
select app_private.sofascore_player_match_enqueue('Q5', pg_temp.id('f0', 2), pg_temp.id('c1', 2), 'away', 'Shirt Taken', null,
  13, null, 'no_candidate', '{}');
select extensions.is(pg_temp.err($$select api.admin_sofascore_create_player('Q5')$$), 'sofascore_create_position_required',
  '8.13 no position on the entry and none given: refused');
select pg_temp.put('cr', api.admin_sofascore_create_player('Q5', p_position => 'defender')::text);
select extensions.is((select shirt_number from app.team_memberships where player_id = (pg_temp.get('cr')::jsonb ->> 'playerId')::uuid),
  null::integer, '8.14 a shirt another active member wears is left blank, as the matcher does');
-- A cleared shirt, and SofaScore's shirt 0 (memberships allow 1 to 99 or none).
select app_private.sofascore_player_match_enqueue('Q7', pg_temp.id('f0', 2), pg_temp.id('c1', 2), 'away', 'Cleared Shirt', null,
  62, 'forward', 'no_candidate', '{}');
select pg_temp.put('cr', api.admin_sofascore_create_player('Q7', p_shirt_number => 0)::text);
select extensions.is((select shirt_number from app.team_memberships where player_id = (pg_temp.get('cr')::jsonb ->> 'playerId')::uuid),
  null::integer, '8.16 staff clearing the shirt (0) creates him with no number, not the list''s 62');
select app_private.sofascore_player_match_enqueue('Q8', pg_temp.id('f0', 2), pg_temp.id('c1', 2), 'away', 'Shirt Zero', null,
  0, 'forward', 'no_candidate', '{}');
select pg_temp.put('cr', api.admin_sofascore_create_player('Q8')::text);
select extensions.is((select shirt_number from app.team_memberships where player_id = (pg_temp.get('cr')::jsonb ->> 'playerId')::uuid),
  null::integer, '8.17 a SofaScore shirt 0 is stored as no number instead of failing');
update app.seasons set is_current = false where id = pg_temp.id('c0', 3);
select app_private.sofascore_player_match_enqueue('Q6', pg_temp.id('f0', 2), pg_temp.id('c1', 2), 'away', 'Old Season', null,
  60, 'forward', 'no_candidate', '{}');
select extensions.is(pg_temp.err($$select api.admin_sofascore_create_player('Q6')$$), 'sofascore_create_season_not_current',
  '8.15 not in a past season');
update app.seasons set is_current = true where id = pg_temp.id('c0', 3);


-- ===========================================================================
-- 9. A mapping written for an alias id around every check stays on the staff list
-- ===========================================================================
select pg_temp.put('ct', app_private.sofascore_create_catalog_player(pg_temp.id('c0', 3), pg_temp.id('c1', 3),
  'Conflict Target', null, 'defender') ->> 'playerId');
insert into app_private.football_provider_mappings (provider_name, entity_type, external_id,
  internal_entity_id, source_version, last_seen_at) values ('sofascore', 'player', 'A5', pg_temp.get('ct')::uuid, 'test', now());
select pg_temp.act('svc');
select pg_temp.put('am', api.service_sofascore_auto_map_players(pg_temp.id('f0', 1),
  jsonb_build_array(pg_temp.pl('A5', 'Second Profile Name', 'home', 77, 'D')))::text);
select extensions.is((select count(*)::int from jsonb_array_elements(pg_temp.get('am')::jsonb -> 'mapped') m
  where m ->> 'sofascorePlayerId' = 'A5'), 0, '9.1 the matcher does not accept an id that is both a mapping and an alias');
select extensions.is((select row(reason, resolved_at is null)::text from app_private.sofascore_player_match_queue
  where sofascore_player_id = 'A5'), row('inactive_mapping_exists', true)::text,
  '9.2 it is open on the staff list, where the conflict can be repaired');

select * from extensions.finish();
rollback;
