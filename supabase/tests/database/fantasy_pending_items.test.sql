begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);
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
from app.fixtures f where f.id = pg_temp.id('f0', 1);

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
-- Fantasy pending items (migration 20261013180100, docs/backend/FANTASY_PENDING_ITEMS.md).
--   A  the SofaScore wrapper accepts the new shapes and refuses bad ones
--   B  readiness: simple_ready is about the fixture; pending_items is counted
--   C  the snapshot, persist and what a pending category emits
--   D  participation (the adaptive scope fix) and who is pending
--   E  read contract
--   F  finalization and resolution (points go up and down)
--   G  a given-up attempt keeps its replies
-- ===========================================================================

-- Second owner (aal2) for a second Fantasy team.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (pg_temp.id('e1', 2), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'pend-b@example.test', 'hash', now(), '{}', '{"username":"pend_b"}', now(), now());
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (pg_temp.id('e3', 2), pg_temp.id('e1', 2), 'TOTP', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at) values (pg_temp.id('e2', 2), pg_temp.id('e1', 2), now());
create function pg_temp.act_as(p_n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('e1', p_n), 'role', 'authenticated',
    'aal', 'aal2', 'session_id', pg_temp.id('e2', p_n))::text, true);
end $$;

-- Fantasy players for the 24 football players.
insert into app.fantasy_players (id, fantasy_season_id, football_player_id, football_team_id, position_id, price)
select pg_temp.id('fa', w.i), pg_temp.id('c0', 5), pg_temp.id('a1', w.i), pg_temp.id('c1', w.club), pos.id, 6
from world w join app.fantasy_positions pos on pos.code = case w.pos when 'goalkeeper' then 'GK'
  when 'defender' then 'DEF' when 'midfielder' then 'MID' else 'FWD' end;
-- Team A: starters 1..11 (holds 3 = clean sheet unknown, 6 = yellow unknown, 8 = straddle, 11 = minutes unknown).
-- Team B: forward 23 starts (a verified non-participant) and 21 is on the bench; holds 3, 6, 8 too but not 11.
insert into app.fantasy_teams (id, user_id, fantasy_season_id, current_gameweek_id, name, bank, team_value, free_transfers)
values (pg_temp.id('b1', 1), pg_temp.id('e1', 1), pg_temp.id('c0', 5), pg_temp.id('c0', 6), 'Team A', 10, 90, 1),
  (pg_temp.id('b1', 2), pg_temp.id('e1', 2), pg_temp.id('c0', 5), pg_temp.id('c0', 6), 'Team B', 10, 90, 1);
insert into app.fantasy_lineups (id, fantasy_team_id, gameweek_id, team_version, locked_at)
values (pg_temp.id('b2', 1), pg_temp.id('b1', 1), pg_temp.id('c0', 6), 1, '2026-08-10 10:30Z'),
  (pg_temp.id('b2', 2), pg_temp.id('b1', 2), pg_temp.id('c0', 6), 1, '2026-08-10 10:30Z');
insert into app.fantasy_lineup_players (lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, snapshot_price)
select pg_temp.id('b2', 1), pg_temp.id('fa', n), case when ord <= 11 then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
  case when ord <= 11 then ord else ord - 11 end, n = 10, n = 2, 6
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,13,17,21]) with ordinality s(n, ord);
insert into app.fantasy_lineup_players (lineup_id, fantasy_player_id, slot, slot_order, captain, vice_captain, snapshot_price)
select pg_temp.id('b2', 2), pg_temp.id('fa', n), case when ord <= 11 then 'starter'::app.fantasy_lineup_slot else 'bench'::app.fantasy_lineup_slot end,
  case when ord <= 11 then ord else ord - 11 end, n = 10, n = 2, 6
from unnest(array[1,2,3,4,5,6,7,8,9,10,23,12,13,17,21]) with ordinality s(n, ord);

-- Row helpers. unk() is what the builder sends for a fact it cannot establish.
create function pg_temp.unk(p_row jsonb, p_field text, p_reason text default null) returns jsonb language sql as $$
  select jsonb_set(jsonb_set(p_row, '{stats}', (p_row->'stats') - p_field), array['evidence', p_field],
    pg_temp.ev('unknown') || case when p_reason is null then '{}'::jsonb else jsonb_build_object('reason', p_reason) end)
$$;
create function pg_temp.setstat(p_row jsonb, p_field text, p_value jsonb) returns jsonb language sql as $$
  select jsonb_set(p_row, array['stats', p_field], p_value)
$$;
-- The rows of the match, by variant. 'first' leaves facts pending; 'resolved' establishes them.
create function pg_temp.vrows(p_variant text) returns jsonb language plpgsql as $$
declare r jsonb; result jsonb := '[]'::jsonb; i integer;
begin
  for i in 1..22 loop
    r := pg_temp.row(i);
    if p_variant = 'first' then
      if i = 3 then r := pg_temp.unk(r, 'cleanSheet', 'timeline_same_moment'); end if;
      if i = 6 then r := pg_temp.unk(r, 'yellowCards', 'card_conflict'); end if;
      if i = 8 then   -- a minutes straddle: the lower value is verified, the item is pending
        r := pg_temp.setstat(r, 'minutes', '45');
        r := pg_temp.unk(pg_temp.unk(r, 'cleanSheet', 'minutes_conflict'), 'goalsConceded', 'minutes_conflict');
        r := r || '{"pendingItems":[{"category":"appearance","reason":"minutes_conflict"}]}'::jsonb; end if;
      if i = 9 then   -- under 60 minutes in every version: the clean sheet is false, goals conceded unknown
        r := pg_temp.setstat(r, 'minutes', '30'); r := pg_temp.setstat(r, 'cleanSheet', 'false');
        r := pg_temp.unk(r, 'goalsConceded', 'timeline_same_moment'); end if;
      if i in (11, 18) then r := pg_temp.unk(r, 'minutes', 'participation_unexplained'); end if;
    elsif p_variant = 'resolved' then
      if i = 6 then r := pg_temp.setstat(r, 'yellowCards', '1'); end if;
      if i = 9 then   -- still under 60 and goals conceded still unknown: nothing waits on it
        r := pg_temp.setstat(r, 'minutes', '30'); r := pg_temp.setstat(r, 'cleanSheet', 'false');
        r := pg_temp.unk(r, 'goalsConceded', 'timeline_same_moment'); end if;
    end if;
    result := result || jsonb_build_array(r);
  end loop;
  return result;
end $$;
create function pg_temp.dry(p_rows jsonb, p_extra jsonb default '{}') returns jsonb language sql as $$
  select api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(p_rows, p_extra), true)
$$;
create function pg_temp.map_row(p_rows jsonb, p_i integer, p_fn text) returns jsonb language plpgsql as $$
declare result jsonb := '[]'::jsonb; r jsonb; n integer := 0;
begin
  for r in select value from jsonb_array_elements(p_rows) loop
    n := n + 1;
    if n = p_i then
      r := case p_fn
        when 'cs_unknown' then pg_temp.unk(r, 'cleanSheet', 'timeline_same_moment')
        when 'goals_unknown' then pg_temp.unk(r, 'goals', 'timeline_same_moment')
        when 'og_unknown' then pg_temp.unk(r, 'ownGoals', 'own_goal_conflict')
        when 'bad_reason' then pg_temp.unk(r, 'cleanSheet', 'because')
        when 'reason_on_verified' then jsonb_set(r, '{evidence,cleanSheet,reason}', '"minutes_conflict"')
        when 'pending_on_90' then r || '{"pendingItems":[{"category":"appearance","reason":"minutes_conflict"}]}'::jsonb
        when 'pending_other' then pg_temp.setstat(r, 'minutes', '45') || '{"pendingItems":[{"category":"goal","reason":"minutes_conflict"}]}'::jsonb
        when 'pending_other_reason' then pg_temp.setstat(r, 'minutes', '45') || '{"pendingItems":[{"category":"appearance","reason":"because"}]}'::jsonb
        when 'pending_two' then pg_temp.setstat(r, 'minutes', '45') || '{"pendingItems":[{"category":"appearance","reason":"minutes_conflict"},{"category":"appearance","reason":"minutes_conflict"}]}'::jsonb
        when 'pending_unverified_minutes' then pg_temp.unk(r, 'minutes', 'minutes_conflict') || '{"pendingItems":[{"category":"appearance","reason":"minutes_conflict"}]}'::jsonb
        when 'pending_extra_key' then pg_temp.setstat(r, 'minutes', '45') || '{"pendingItems":[{"category":"appearance","reason":"minutes_conflict","x":1}]}'::jsonb
        when 'straddle_ok' then pg_temp.unk(pg_temp.setstat(r, 'minutes', '45'), 'cleanSheet', 'minutes_conflict') || '{"pendingItems":[{"category":"appearance","reason":"minutes_conflict"}]}'::jsonb
        when 'bad_value' then jsonb_set(r, '{stats,yellowCards}', '-1')
        when 'cs_true_30' then pg_temp.setstat(pg_temp.setstat(pg_temp.unk(r, 'goalsConceded'), 'minutes', '30'), 'cleanSheet', 'true')
        when 'overlap' then pg_temp.setstat(pg_temp.setstat(r, 'secondYellowDismissals', '1'), 'yellowCards', '1')
        when 'sy_with_unknown_yellow' then pg_temp.unk(pg_temp.setstat(r, 'secondYellowDismissals', '1'), 'yellowCards', 'card_conflict')
        else r end;
    end if;
    result := result || jsonb_build_array(r);
  end loop;
  return result;
end $$;
create function pg_temp.dcode(p_rows jsonb) returns text language plpgsql as $$
begin
  perform api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(p_rows), true);
  return 'ok';
exception when others then return sqlerrm;
end $$;

-- ===========================================================================
-- A. The SofaScore wrapper
-- ===========================================================================
select pg_temp.act('svc');
select extensions.is(pg_temp.dcode(pg_temp.vrows('first')), 'ok', 'A.1 the shapes the builder sends are accepted (unknown fields, reasons, a straddle, unknown minutes)');
select extensions.is(pg_temp.dcode(pg_temp.map_row(pg_temp.vrows('base'), 3, 'straddle_ok')), 'ok', 'A.2 a verified minutes value under 60 may carry the appearance/minutes_conflict item');
select extensions.is(pg_temp.dcode(pg_temp.map_row(pg_temp.vrows('base'), 3, 'pending_on_90')), 'sofascore_pending_items_invalid', 'A.3 pendingItems on minutes of 60 or more is refused');
select extensions.is(pg_temp.dcode(pg_temp.map_row(pg_temp.vrows('base'), 3, 'pending_other')), 'sofascore_pending_items_invalid', 'A.4 any other category is refused');
select extensions.is(pg_temp.dcode(pg_temp.map_row(pg_temp.vrows('base'), 3, 'pending_other_reason')), 'sofascore_pending_items_invalid', 'A.5 any other reason is refused');
select extensions.is(pg_temp.dcode(pg_temp.map_row(pg_temp.vrows('base'), 3, 'pending_two')), 'sofascore_pending_items_invalid', 'A.6 only one item is allowed');
select extensions.is(pg_temp.dcode(pg_temp.map_row(pg_temp.vrows('base'), 3, 'pending_extra_key')), 'sofascore_pending_items_invalid', 'A.7 and no extra key');
select extensions.is(pg_temp.dcode(pg_temp.map_row(pg_temp.vrows('base'), 3, 'pending_unverified_minutes')), 'sofascore_pending_items_invalid', 'A.8 the item needs verified minutes');
select extensions.is(pg_temp.dcode(pg_temp.map_row(pg_temp.vrows('base'), 3, 'bad_reason')), 'sofascore_evidence_invalid', 'A.9 a reason outside the list is refused');
select extensions.is(pg_temp.dcode(pg_temp.map_row(pg_temp.vrows('base'), 3, 'reason_on_verified')), 'sofascore_evidence_invalid', 'A.10 a reason on verified evidence is refused');
select extensions.is(pg_temp.dcode(jsonb_set(pg_temp.vrows('base'), '{0,evidence,minutes,state}', '"bogus"')), 'sofascore_evidence_invalid', 'A.11 other evidence states are still refused');
select extensions.is(pg_temp.dcode(pg_temp.map_row(pg_temp.vrows('base'), 3, 'bad_value')), 'ok', 'A.12 (the wrapper does not judge values: the recorder holds a bad value, see B.7)');
select extensions.is(pg_temp.observations(), 0, 'A.13 dry runs stored nothing');

-- ===========================================================================
-- B. Readiness
-- ===========================================================================
select extensions.is((pg_temp.dry(pg_temp.vrows('first')) ->> 'simpleReady')::boolean, true, 'B.1 pending facts on several players do not hold the fixture: simple_ready');
select extensions.is((pg_temp.dry(pg_temp.vrows('first')) ->> 'fullReady')::boolean, false, 'B.2 but it is not full-ready');
select extensions.is((pg_temp.dry(pg_temp.vrows('first')) ->> 'pendingItems')::integer, 8,
  'B.3 pending items: 1 (player 3) + 1 (6) + 3 (8: the item and two unknowns) + 1 (9) + 1 (11) + 1 (18) = 8');
select extensions.is((pg_temp.dry(pg_temp.map_row(pg_temp.vrows('base'), 3, 'cs_unknown')) ->> 'simpleReady')::boolean, true, 'B.4 one player''s clean sheet unknown: simple_ready');
select extensions.is((pg_temp.dry(pg_temp.map_row(pg_temp.vrows('base'), 3, 'cs_unknown')) ->> 'pendingItems')::integer, 1, 'B.5 and pending_items is 1');
select extensions.is((pg_temp.dry(pg_temp.vrows('base')) ->> 'pendingItems')::integer, 0, 'B.6 nothing unknown, nothing pending');
select extensions.is(pg_temp.dcode(pg_temp.map_row(pg_temp.vrows('base'), 3, 'bad_value')), 'ok', 'B.7a a bad value is not an unknown: the request is accepted ...');
select extensions.is((pg_temp.dry(pg_temp.map_row(pg_temp.vrows('base'), 3, 'bad_value')) ->> 'simpleReady')::boolean, false, 'B.7 ... and holds the fixture (not ready)');
select extensions.is((pg_temp.dry(pg_temp.map_row(pg_temp.vrows('base'), 10, 'goals_unknown')) ->> 'simpleReady')::boolean, false, 'B.8 goals unknown: the goals cannot be added up, so not simple_ready');
select extensions.is((pg_temp.dry(pg_temp.map_row(pg_temp.vrows('base'), 4, 'og_unknown')) ->> 'simpleReady')::boolean, true, 'B.9 an unknown own goal is a lower bound: simple_ready while the goals still fit');
select extensions.is(pg_temp.dcode(pg_temp.map_row(pg_temp.vrows('base'), 3, 'cs_true_30')), 'adaptive_statistics_inconsistent', 'B.10 a certain clean sheet under 60 minutes still contradicts (goals conceded unknown does not hide it)');
select extensions.is(pg_temp.dcode(pg_temp.map_row(pg_temp.vrows('base'), 3, 'overlap')), 'adaptive_disciplinary_overlap_review_required', 'B.11 the second-yellow overlap check holds when every field is known');
select extensions.is(pg_temp.dcode(pg_temp.map_row(pg_temp.vrows('base'), 3, 'sy_with_unknown_yellow')), 'ok', 'B.12 and does not run on a field that is unknown');
select extensions.is((pg_temp.dry(jsonb_set(pg_temp.vrows('base'), '{9,stats,goals}', '2')) ->> 'simpleReady')::boolean, false, 'B.13 goals that do not add up to the score still hold the fixture');

-- ===========================================================================
-- C. The snapshot, and the points save
-- ===========================================================================
select pg_temp.put('rec', api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1),
  pg_temp.request(pg_temp.vrows('first')), false)::text);
select extensions.is((pg_temp.get('rec')::jsonb ->> 'created')::boolean, true, 'C.1 the pending observation is recorded');
select extensions.is((select pending_items from app_private.fantasy_fixture_observations), 8, 'C.2 pending_items is stored');
select extensions.is((select simple_ready from app_private.fantasy_fixture_observations), true, 'C.3 simple_ready is stored');
select api.service_select_fantasy_scoring_modes(pg_temp.id('c0', 6));
select extensions.is((select mode from app_private.fantasy_fixture_scoring_modes where fixture_id = pg_temp.id('f0', 1)), 'simple',
  'C.4 not full-ready after the cutoff: simple mode');
insert into app_private.fantasy_live_scoring_policy (season_id, enabled) values (pg_temp.id('c0', 5), true);
select pg_temp.put('v1', api.service_prepare_fantasy_live_scoring(pg_temp.id('c0', 6)) ->> 'calculationVersion');
select extensions.ok(pg_temp.get('v1')::bigint >= 1, 'C.5 a snapshot version');
select pg_temp.put('snap', api.service_get_fantasy_scoring_snapshot(pg_temp.id('c0', 6), pg_temp.get('v1')::bigint, null, 100)::text);
create function pg_temp.prow(p_i integer) returns jsonb language sql as $$
  select p from jsonb_array_elements(pg_temp.get('snap')::jsonb -> 'playerFixtures') p
  where p ->> 'fantasyPlayerId' = pg_temp.id('fa', p_i)::text
$$;
select extensions.is(jsonb_array_length(pg_temp.get('snap')::jsonb -> 'fixtures'), 1, 'C.6 the fixture is ready and publishes');
select extensions.is(pg_temp.prow(3) -> 'pendingCategories', '["clean_sheet"]'::jsonb, 'C.7 player 3: only the clean sheet is pending');
select extensions.is(pg_temp.prow(6) -> 'pendingCategories', '["yellow_card"]'::jsonb, 'C.8 player 6: only the yellow card');
select extensions.is(pg_temp.prow(8) -> 'pendingCategories', '["appearance", "clean_sheet", "goals_conceded"]'::jsonb,
  'C.9 player 8 (a minutes straddle): appearance (upgrade possible), clean sheet and goals conceded');
select extensions.is(pg_temp.prow(8) -> 'pendingItems', '[{"category":"appearance","reason":"minutes_conflict"}]'::jsonb, 'C.10 the row''s pendingItems are carried');
select extensions.is(pg_temp.prow(9) -> 'pendingCategories', null, 'C.11 player 9 (30 minutes): the under-60 rule decides clean sheet and goals conceded, nothing is pending');
select extensions.is(pg_temp.prow(11) -> 'pendingCategories', '["appearance", "clean_sheet", "goals_conceded"]'::jsonb, 'C.12 player 11 (minutes unknown): appearance, clean sheet and goals conceded');
select extensions.is(pg_temp.prow(1) -> 'pendingCategories', null, 'C.13 a player with nothing pending carries no key (snapshot digests of other rows are unchanged)');
select extensions.is((pg_temp.get('snap')::jsonb -> 'pendingPlayerIds') ? pg_temp.id('fa', 11)::text, true, 'C.14 the unknown-participation player is in pendingPlayerIds');
select extensions.is((pg_temp.get('snap')::jsonb -> 'pendingPlayerIds') ? pg_temp.id('fa', 3)::text, false, 'C.15 a player with only a pending clean sheet is not');

-- Results as the scorer produces them: an event for every scorable category (appearance 2 or 1,
-- clean sheet 4 for a defender, a yellow card -1, a goal 4); a pending category has none.
create function pg_temp.player_results(p_snapshot jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('fantasyPlayerId', p -> 'fantasyPlayerId', 'fixtureId', p -> 'fixtureId',
    'events', (select coalesce(jsonb_agg(jsonb_build_object('category', c,
        'points', case c
          when 'appearance' then case when (p #>> '{stats,minutes}')::integer >= 60 then 2 else 1 end
          when 'clean_sheet' then case when (p #>> '{stats,cleanSheet}')::boolean and (p #>> '{stats,minutes}')::integer >= 60 and p ->> 'position' in ('GK', 'DEF') then 4 else 0 end
          when 'yellow_card' then -(p #>> '{stats,yellowCards}')::integer
          when 'goal' then 4 * (p #>> '{stats,goals}')::integer
          else 0 end,
        'sourceKey', 'fixture-stats:' || (p ->> 'fixtureId') || ':' || (p ->> 'playerId') || ':' || c) order by c), '[]'::jsonb)
      from unnest(app_private.fantasy_row_scorable_categories(p, (p_snapshot #>> '{ruleset,full_appearance_minutes}')::integer)) c)) order by p ->> 'fantasyPlayerId'), '[]'::jsonb)
  from jsonb_array_elements(p_snapshot -> 'playerFixtures') p
$$;
create function pg_temp.event_cats(p_i integer) returns text language sql as $$
  select coalesce(string_agg(e.category, ',' order by e.category), '') from app.fantasy_player_point_events e
  where e.fantasy_player_id = pg_temp.id('fa', p_i) and e.superseded_at is null
$$;
create function pg_temp.team_result(p_team integer, p_subs jsonb default '[]') returns jsonb language plpgsql as $$
declare lp record; start_pts integer := 0; bench_pts integer := 0; cap_pts integer := 0; players jsonb := '[]'::jsonb; mult integer;
  pts integer; subbed_out boolean; subbed_in boolean; cap uuid := pg_temp.id('fa', 10);
begin
  for lp in select l.fantasy_player_id, l.slot, l.captain, coalesce(g.provisional_points, 0) as pts
      from app.fantasy_lineup_players l left join app.fantasy_player_gameweek_points g
        on g.fantasy_player_id = l.fantasy_player_id and g.gameweek_id = pg_temp.id('c0', 6)
      where l.lineup_id = pg_temp.id('b2', p_team) loop
    subbed_out := exists (select 1 from jsonb_array_elements(p_subs) s where s ->> 'playerOutId' = lp.fantasy_player_id::text);
    subbed_in := exists (select 1 from jsonb_array_elements(p_subs) s where s ->> 'playerInId' = lp.fantasy_player_id::text);
    if (lp.slot = 'starter' and not subbed_out) or subbed_in then start_pts := start_pts + lp.pts; mult := case when lp.captain then 2 else 1 end;
    else if lp.slot = 'bench' then bench_pts := bench_pts + lp.pts; end if; mult := 0; end if;
    if lp.captain then cap_pts := lp.pts; end if;
    players := players || jsonb_build_array(jsonb_build_object('fantasyPlayerId', lp.fantasy_player_id, 'multiplier', mult));
  end loop;
  return jsonb_build_object('teamId', pg_temp.id('b1', p_team), 'lineupId', pg_temp.id('b2', p_team),
    'startingPoints', start_pts, 'benchPoints', bench_pts, 'captainPoints', cap_pts, 'transferHit', 0,
    'provisionalScore', start_pts + cap_pts, 'effectiveCaptainId', cap, 'substitutions', p_subs, 'players', players);
end $$;

select pg_temp.put('res', pg_temp.player_results(pg_temp.get('snap')::jsonb)::text);
-- Wrong category sets are refused.
select extensions.throws_ok(format($$select api.service_persist_fantasy_scoring_results(pg_temp.id('c0', 6), pg_temp.get('v1')::bigint, %L,
  (select jsonb_agg(case when r ->> 'fantasyPlayerId' = %L then jsonb_set(r, '{events}', (r -> 'events') || %L::jsonb) else r end)
   from jsonb_array_elements(pg_temp.get('res')::jsonb) r), '[]')$$,
  pg_temp.get('snap')::jsonb ->> 'inputDigest', pg_temp.id('fa', 3)::text,
  jsonb_build_object('category', 'clean_sheet', 'points', 4, 'sourceKey', 'fixture-stats:' || pg_temp.id('f0', 1) || ':' || pg_temp.id('a1', 3) || ':clean_sheet')::text),
  'PT400', 'fantasy_player_result_scope_invalid', 'C.27 an event for a pending category is refused');
select extensions.throws_ok(format($$select api.service_persist_fantasy_scoring_results(pg_temp.id('c0', 6), pg_temp.get('v1')::bigint, %L,
  (select jsonb_agg(case when r ->> 'fantasyPlayerId' = %L then jsonb_set(r, '{events}', (select jsonb_agg(e) from jsonb_array_elements(r -> 'events') e where e ->> 'category' <> 'appearance')) else r end)
   from jsonb_array_elements(pg_temp.get('res')::jsonb) r), '[]')$$,
  pg_temp.get('snap')::jsonb ->> 'inputDigest', pg_temp.id('fa', 8)::text),
  'PT400', 'fantasy_player_result_scope_invalid', 'C.28 leaving out the confirmed short appearance is refused');
select extensions.lives_ok($$select api.service_persist_fantasy_scoring_results(pg_temp.id('c0', 6), pg_temp.get('v1')::bigint,
  pg_temp.get('snap')::jsonb ->> 'inputDigest', pg_temp.get('res')::jsonb, '[]')$$, 'C.17 the save accepts results that leave the pending categories out');
select extensions.is(pg_temp.event_cats(3), 'appearance,goal,goals_conceded,own_goal,red_card,second_yellow_dismissal,yellow_card',
  'C.18 player 3: every category but the pending clean sheet is live in the ledger (simple mode leaves assist, saves and penalties out)');
select extensions.is(pg_temp.event_cats(6), 'appearance,clean_sheet,goal,goals_conceded,own_goal,red_card,second_yellow_dismissal',
  'C.19 player 6: everything but the pending yellow card');
select extensions.is(pg_temp.event_cats(8), 'appearance,goal,own_goal,red_card,second_yellow_dismissal,yellow_card',
  'C.20 player 8 (straddle): the confirmed short appearance is scored; clean sheet and goals conceded are not');
select extensions.is((select points from app.fantasy_player_point_events where fantasy_player_id = pg_temp.id('fa', 8) and category = 'appearance' and superseded_at is null), 1,
  'C.21 and it is the short value (1)');
select extensions.is(pg_temp.event_cats(9), 'appearance,clean_sheet,goal,goals_conceded,own_goal,red_card,second_yellow_dismissal,yellow_card',
  'C.22 player 9 (30 minutes): the under-60 rule scores clean sheet and goals conceded (no pending)');
select extensions.is(pg_temp.event_cats(11), 'goal,own_goal,red_card,second_yellow_dismissal,yellow_card', 'C.23 player 11 (minutes unknown): no appearance, clean sheet or goals conceded');
select extensions.is(pg_temp.event_cats(1), 'appearance,clean_sheet,goal,goals_conceded,own_goal,red_card,second_yellow_dismissal,yellow_card', 'C.24 a player with nothing pending: all eight simple categories');
select extensions.is((select did_play from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.id('fa', 11) and gameweek_id = pg_temp.id('c0', 6)), false,
  'C.25 unknown minutes are not played minutes (and are never a confirmed zero: see the read contract)');
select extensions.is((select jsonb_agg(items) from app_private.fantasy_player_gameweek_pending where fantasy_player_id = pg_temp.id('fa', 3)),
  jsonb_build_array(jsonb_build_array(jsonb_build_object('fixtureId', pg_temp.id('f0', 1), 'category', 'clean_sheet', 'reason', 'timeline_same_moment'))),
  'C.26 what is pending is recorded with its reason');
select extensions.is(api.service_persist_fantasy_scoring_results(pg_temp.id('c0', 6), pg_temp.get('v1')::bigint, pg_temp.get('snap')::jsonb ->> 'inputDigest', pg_temp.get('res')::jsonb, '[]') ->> 'playersPersisted',
  (select count(*)::text from jsonb_array_elements(pg_temp.get('snap')::jsonb -> 'players')), 'C.29 replaying the same results changes nothing and succeeds');

-- ===========================================================================
-- D. Participation, and the adaptive scope fix
-- ===========================================================================
-- Team A holds the unknown-participation player; team B does not.
select extensions.is((pg_temp.get('snap')::jsonb -> 'pendingPlayerIds') ? pg_temp.id('fa', 18)::text, false,
  'D.1 an unknown player in nobody''s locked lineup is not in pendingPlayerIds');
select extensions.is(pg_temp.prow(18) -> 'pendingCategories', '["appearance", "clean_sheet", "goals_conceded"]'::jsonb, 'D.2 but his own items are still listed');
select extensions.is((pg_temp.get('snap')::jsonb -> 'pendingPlayerIds') ? pg_temp.id('fa', 23)::text, false,
  'D.3 a verified non-participant is not pending (adaptive participation comes from the observation)');
-- Team A cannot take a substitution; team B can.
select extensions.throws_ok(format($$select api.service_persist_fantasy_scoring_results(pg_temp.id('c0', 6), pg_temp.get('v1')::bigint, %L, pg_temp.get('res')::jsonb,
  jsonb_build_array(pg_temp.team_result(1, jsonb_build_array(jsonb_build_object('playerOutId', %L, 'playerInId', %L, 'reason', 'outfield_did_not_play')))))$$,
  pg_temp.get('snap')::jsonb ->> 'inputDigest', pg_temp.id('fa', 11)::text, pg_temp.id('fa', 13)::text),
  'PT409', 'fantasy_participation_pending', 'D.4 a lineup that holds the unknown player gets no automatic substitution');
select extensions.lives_ok(format($$select api.service_persist_fantasy_scoring_results(pg_temp.id('c0', 6), pg_temp.get('v1')::bigint, %L, pg_temp.get('res')::jsonb,
  jsonb_build_array(pg_temp.team_result(1)))$$, pg_temp.get('snap')::jsonb ->> 'inputDigest'), 'D.5 team A saves without it');
select extensions.lives_ok(format($$select api.service_persist_fantasy_scoring_results(pg_temp.id('c0', 6), pg_temp.get('v1')::bigint, %L, pg_temp.get('res')::jsonb,
  jsonb_build_array(pg_temp.team_result(2, jsonb_build_array(jsonb_build_object('playerOutId', %L, 'playerInId', %L, 'reason', 'outfield_did_not_play')))))$$,
  pg_temp.get('snap')::jsonb ->> 'inputDigest', pg_temp.id('fa', 23)::text, pg_temp.id('fa', 21)::text),
  'D.6 a lineup without him still substitutes a verified non-participant');
select extensions.is((select count(*)::integer from app.fantasy_auto_substitutions where lineup_id = pg_temp.id('b2', 2)), 1, 'D.7 team B has its substitution');
select extensions.is((select count(*)::integer from app.fantasy_auto_substitutions where lineup_id = pg_temp.id('b2', 1)), 0, 'D.8 team A has none');

-- The legacy anonymous-starter rule must not override adaptive participation. The fixture's
-- legacy coverage row says one anonymous starter; player 23 (verified absence) has no performance row.
insert into app_private.historical_performance_fixture_coverage (fixture_id, football_season_id, source_provider, source_version,
  lineup_rows_seen, valid_player_rows, excluded_incomplete_rows, starter_rows, team_count, detail_rows, invalid_detail_rows,
  performance_rows, reconciled, provider_observed_at, scoring_statistics_complete, anonymous_starter_rows, identified_starter_rows)
values (pg_temp.id('f0', 1), pg_temp.id('c0', 3), 'sportsmonks', 'sportsmonks-fixture:' || repeat('a', 64),
  24, 22, 2, 21, 2, 264, 0, 22, true, '2026-08-10 14:00Z', true, 1, 21);
select extensions.is((select (f -> 'coverage' ->> 'anonymous_starter_rows')::integer from jsonb_array_elements(app_private.fantasy_scoring_input_document(pg_temp.id('c0', 6)) -> 'fixtures') f), 1,
  'D.9 (setup) the adaptive document carries the legacy anonymous-starter coverage');
select extensions.is((app_private.fantasy_scoring_input_document(pg_temp.id('c0', 6)) -> 'pendingPlayerIds') ? pg_temp.id('fa', 23)::text, false,
  'D.10 adaptive: a verified absence with legacy anonymous starters and no performance row is NOT pending');
select extensions.is((app_private.fantasy_scoring_input_document(pg_temp.id('c0', 6)) -> 'pendingPlayerIds') ? pg_temp.id('fa', 11)::text, true,
  'D.11 adaptive: genuinely unknown participation is pending');
select extensions.is((app_private.fantasy_scoring_input_document(pg_temp.id('c0', 6)) -> 'pendingPlayerIds') ? pg_temp.id('fa', 18)::text, false,
  'D.12 adaptive: an unselected unknown player is not');
select extensions.is(jsonb_array_length(app_private.fantasy_scoring_input_document(pg_temp.id('c0', 6)) -> 'pendingFixtures'), 0, 'D.13 and the fixture stays ready');

-- ===========================================================================
-- E. The read contract
-- ===========================================================================
select pg_temp.act_as(1);
select pg_temp.put('mine', api.get_my_fantasy_points(pg_temp.id('b1', 1), pg_temp.id('c0', 6))::text);
create function pg_temp.mp(p_i integer) returns jsonb language sql as $$
  select p from jsonb_array_elements(pg_temp.get('mine')::jsonb -> 'players') p where p ->> 'fantasyPlayerId' = pg_temp.id('fa', p_i)::text
$$;
select extensions.is(pg_temp.mp(3) -> 'pendingItems', jsonb_build_array(jsonb_build_object('fixtureId', pg_temp.id('f0', 1), 'category', 'clean_sheet', 'reason', 'timeline_same_moment')),
  'E.1 player 3: the pending clean sheet with its reason');
select extensions.is(pg_temp.mp(3) ->> 'pointsStatus', 'provisional', 'E.2 and his points are provisional (points exist, items wait)');
select extensions.is(pg_temp.mp(8) -> 'pendingItems', jsonb_build_array(
  jsonb_build_object('fixtureId', pg_temp.id('f0', 1), 'category', 'appearance', 'reason', 'minutes_conflict'),
  jsonb_build_object('fixtureId', pg_temp.id('f0', 1), 'category', 'clean_sheet', 'reason', 'minutes_conflict'),
  jsonb_build_object('fixtureId', pg_temp.id('f0', 1), 'category', 'goals_conceded', 'reason', 'minutes_conflict')),
  'E.3 player 8: the straddle''s items take the row''s reason');
select extensions.is(pg_temp.mp(11) ->> 'pointsStatus', 'pending', 'E.4 the unknown-participation player has no confirmed points: pending');
select extensions.is(pg_temp.mp(11) #>> '{pendingItems,0,reason}', 'participation_unexplained', 'E.5 with the reason the builder gave');
select extensions.is(pg_temp.mp(1) ->> 'pointsStatus', 'provisional', 'E.6 a player with nothing pending is provisional while the gameweek is not final');
select extensions.is(pg_temp.mp(1) -> 'pendingItems', '[]'::jsonb, 'E.7 and has no pending items');
select extensions.is((pg_temp.get('mine')::jsonb #>> '{result,pendingItemCount}')::integer, 8, 'E.8 the team result counts the lineup''s pending items (1 + 1 + 3 + 3)');
select pg_temp.act_as(2);
select extensions.is((api.get_my_fantasy_points(pg_temp.id('b1', 2), pg_temp.id('c0', 6)) #>> '{result,pendingItemCount}')::integer, 5, 'E.9 team B, without player 11: 1 + 1 + 3');
select extensions.is((select p ->> 'pointsStatus' from jsonb_array_elements(api.get_my_fantasy_points(pg_temp.id('b1', 2), pg_temp.id('c0', 6)) -> 'players') p
  where p ->> 'fantasyPlayerId' = pg_temp.id('fa', 23)::text), 'provisional', 'E.10 the verified non-participant has confirmed (zero) points, not pending');
select pg_temp.act('svc');
select extensions.is(api.fantasy_player_gameweek_history(pg_temp.id('fa', 3)) -> 0 -> 'pendingItems',
  jsonb_build_array(jsonb_build_object('fixtureId', pg_temp.id('f0', 1), 'category', 'clean_sheet', 'reason', 'timeline_same_moment')),
  'E.11 the player''s history lists the pending item for the gameweek');
select extensions.is(api.fantasy_player_gameweek_history(pg_temp.id('fa', 1)) -> 0 -> 'pendingItems', '[]'::jsonb, 'E.12 and an empty list when none');
select extensions.ok(not has_table_privilege('authenticated', 'app_private.fantasy_player_gameweek_pending', 'select'), 'E.13 the pending table is not readable by users');

-- ===========================================================================
-- F. Finalization, and resolution
-- ===========================================================================
select extensions.throws_ok(format($$select api.service_begin_fantasy_finalization(pg_temp.id('c0', 6), pg_temp.get('v1')::bigint, %L)$$, pg_temp.get('snap')::jsonb ->> 'inputDigest'),
  'PT409', 'fantasy_pending_items_unresolved', 'F.1 a pending item keeps the gameweek from finalizing');
select pg_temp.put('before3', (select provisional_points::text from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.id('fa', 3) and gameweek_id = pg_temp.id('c0', 6)));
select pg_temp.put('before6', (select provisional_points::text from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.id('fa', 6) and gameweek_id = pg_temp.id('c0', 6)));
select pg_temp.put('before11', (select provisional_points::text from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.id('fa', 11) and gameweek_id = pg_temp.id('c0', 6)));
select pg_temp.put('beforeA', (select provisional_score::text from app.fantasy_team_gameweek_results where fantasy_team_id = pg_temp.id('b1', 1) and gameweek_id = pg_temp.id('c0', 6)));
-- Later observation: the doubts are resolved.
select pg_temp.put('rec2', api.service_record_sofascore_fantasy_observation(pg_temp.id('f0', 1), pg_temp.request(pg_temp.vrows('resolved')), false)::text);
select extensions.is((pg_temp.get('rec2')::jsonb ->> 'created')::boolean, true, 'F.2 the resolving observation is recorded');
select extensions.is((select pending_items from app_private.fantasy_fixture_observations order by id desc limit 1), 1,
  'F.3 one unknown field remains (player 9''s goals conceded, which cannot matter under 60 minutes)');
select pg_temp.put('v2', api.service_prepare_fantasy_live_scoring(pg_temp.id('c0', 6)) ->> 'calculationVersion');
select extensions.ok(pg_temp.get('v2')::bigint > pg_temp.get('v1')::bigint, 'F.4 a new calculation version');
select pg_temp.put('snap2', api.service_get_fantasy_scoring_snapshot(pg_temp.id('c0', 6), pg_temp.get('v2')::bigint, null, 100)::text);
select extensions.is((select count(*)::integer from jsonb_array_elements(pg_temp.get('snap2')::jsonb -> 'playerFixtures') p where p ? 'pendingCategories'), 0, 'F.5 nothing is pending any more');
select extensions.is(jsonb_array_length(pg_temp.get('snap2')::jsonb -> 'pendingPlayerIds'), 0, 'F.6 and nobody''s participation is');
select pg_temp.put('res2', pg_temp.player_results(pg_temp.get('snap2')::jsonb)::text);
select api.service_persist_fantasy_scoring_results(pg_temp.id('c0', 6), pg_temp.get('v2')::bigint, pg_temp.get('snap2')::jsonb ->> 'inputDigest', pg_temp.get('res2')::jsonb, '[]');
select extensions.is((select provisional_points from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.id('fa', 3) and gameweek_id = pg_temp.id('c0', 6)),
  pg_temp.get('before3')::integer + 4, 'F.7 an increase: the resolved clean sheet adds 4 for player 3');
select extensions.is((select provisional_points from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.id('fa', 6) and gameweek_id = pg_temp.id('c0', 6)),
  pg_temp.get('before6')::integer - 1, 'F.8 a decrease: the resolved yellow card takes 1 from player 6');
select extensions.is((select provisional_points from app.fantasy_player_gameweek_points where fantasy_player_id = pg_temp.id('fa', 11) and gameweek_id = pg_temp.id('c0', 6)),
  pg_temp.get('before11')::integer + 2, 'F.9 player 11 gets his appearance once his minutes are known');
select extensions.is((select count(*)::integer from app_private.fantasy_player_gameweek_pending where gameweek_id = pg_temp.id('c0', 6)), 0, 'F.10 the pending record is cleared');
select api.service_persist_fantasy_scoring_results(pg_temp.id('c0', 6), pg_temp.get('v2')::bigint, pg_temp.get('snap2')::jsonb ->> 'inputDigest', pg_temp.get('res2')::jsonb,
  jsonb_build_array(pg_temp.team_result(1), pg_temp.team_result(2, jsonb_build_array(jsonb_build_object('playerOutId', pg_temp.id('fa', 23), 'playerInId', pg_temp.id('fa', 21), 'reason', 'outfield_did_not_play')))));
select extensions.is((select provisional_score from app.fantasy_team_gameweek_results where fantasy_team_id = pg_temp.id('b1', 1) and gameweek_id = pg_temp.id('c0', 6)),
  pg_temp.get('beforeA')::integer + 6,
  'F.11 team A''s score moved by +4 (clean sheet) -1 (yellow) +2 (player 11) +1 (player 8''s appearance upgrade)');
select extensions.is(api.service_begin_fantasy_finalization(pg_temp.id('c0', 6), pg_temp.get('v2')::bigint, pg_temp.get('snap2')::jsonb ->> 'inputDigest') ->> 'sealed', 'true',
  'F.12 with nothing pending the gameweek finalizes');

-- ===========================================================================
-- G. A given-up attempt keeps its replies
-- ===========================================================================
select extensions.is(api.service_sofascore_fantasy_note(pg_temp.id('f0', 2), '9002', 'gave_up', 'needs_review', '[]',
  '{"lineups":{"x":1}}'::jsonb, repeat('c', 64), null) ->> 'status', 'gave_up', 'G.1 giving up is stored');
select extensions.is((api.service_sofascore_fantasy_context(pg_temp.id('f0', 2)) -> 'attempt' -> 'matchData') is not null, true, 'G.2 and keeps the replies it was given');
select extensions.is((api.service_sofascore_fantasy_context(pg_temp.id('f0', 2)) -> 'attempt' ->> 'dataDigest'), repeat('c', 64), 'G.3 and the digest');
select extensions.is((api.service_sofascore_fantasy_due(6, 1, 72, 2, 4) -> 'retry') ? pg_temp.id('f0', 2)::text, false, 'G.4 a given-up attempt is not due for a retry');
select extensions.is(api.service_sofascore_fantasy_note(pg_temp.id('f0', 2), '9002', 'gave_up', 'needs_review', '[]', null, null, null) ->> 'status', 'gave_up', 'G.5 giving up again without replies');
select extensions.is((api.service_sofascore_fantasy_context(pg_temp.id('f0', 2)) -> 'attempt' -> 'matchData') is not null, true, 'G.6 keeps the earlier ones');
select extensions.throws_ok($$select api.service_sofascore_fantasy_note(pg_temp.id('f0', 2), '9002', 'gave_up', 'x', '[]', jsonb_build_object('pad', repeat('a', 600000)), null, null)$$,
  'PT400', 'sofascore_fantasy_note_invalid', 'G.7 the 512 KiB limit still holds');

select * from extensions.finish();
rollback;
