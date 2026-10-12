-- Staged SofaScore statistics: pull schedule, scoring layers, close on provisional points, re-scoring, lock (docs/backend/SOFASCORE_STAGED_STATS.md).
begin;

select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3) values
  ('f0000000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('f1000000-0000-4000-8000-000000000001', 'fantasy-test', 'Fantasy Test', 'FT', 'league',
  'f0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
  '2089/90', '2089-08-01', '2090-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
values ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
  1, 'Gameweek 1', 'active');

insert into app.teams (id, slug, name, short_name, code, country_id)
select ('f4' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'fantasy-club-' || i, 'Fantasy Club ' || i, 'FC' || i, 'F' || lpad(i::text, 2, '0'),
  'f0000000-0000-4000-8000-000000000001'
from generate_series(1, 16) i;

insert into app.players (id, slug, full_name, display_name, position)
select ('f5' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'fantasy-player-' || i, 'Fantasy Player ' || i, 'Player ' || i,
  case when i <= 2 then 'goalkeeper'::app.football_position
    when i <= 7 then 'defender'::app.football_position
    when i <= 12 then 'midfielder'::app.football_position
    else 'forward'::app.football_position end
from generate_series(1, 17) i;

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('f6000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
  'fantasy-test', 'Fantasy Test', true);
insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('f6300000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  '2089/90', 'active', '2089-08-01', '2090-06-30');
insert into app.fantasy_gameweeks (
  id, fantasy_season_id, football_round_id, sequence_number, name,
  deadline_at, starts_at, ends_at, status
) values ('f6400000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001', 1, 'Gameweek 1',
  '2090-01-01T11:00:00Z', '2090-01-01T12:00:00Z', '2090-01-08T12:00:00Z', 'open');

insert into app.fantasy_players (
  id, fantasy_season_id, football_player_id, football_team_id, position_id, price
)
select ('f7' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  'f6300000-0000-4000-8000-000000000001',
  ('f5' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid,
  ('f4' || lpad((((i - 1) % 16) + 1)::text, 6, '0')
    || '-0000-4000-8000-000000000001')::uuid,
  (select id from app.fantasy_positions where code = case
    when i <= 2 then 'GK' when i <= 7 then 'DEF' when i <= 12 then 'MID' else 'FWD' end),
  6
from generate_series(1, 17) i;

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('f8000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'fantasy-one@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"fantasy_one"}', statement_timestamp(), statement_timestamp()),
  ('f8000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'fantasy-two@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"fantasy_two"}', statement_timestamp(), statement_timestamp());

select set_config('test.fantasy_selection', (
  select jsonb_agg(jsonb_build_object(
    'fantasy_player_id', player.id,
    'slot', case when player_number in (1,3,4,5,6,8,9,10,11,13,14) then 'starter' else 'bench' end,
    'slot_order', case player_number
      when 1 then 1 when 3 then 2 when 4 then 3 when 5 then 4 when 6 then 5
      when 8 then 6 when 9 then 7 when 10 then 8 when 11 then 9 when 13 then 10 when 14 then 11
      when 2 then 1 when 7 then 2 when 12 then 3 when 15 then 4 end,
    'captain', player_number = 8, 'vice_captain', player_number = 13
  ) order by player_number)::text from (
    select id, row_number() over (order by id) as player_number from app.fantasy_players
    order by id limit 15
  ) player
), true);


set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('test.normal_team', api.create_fantasy_team(
 'f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',
 'Normal Progression',current_setting('test.fantasy_selection')::jsonb,'fa000000-0000-4000-8000-000000000001')->>'id',true);
select set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select set_config('test.free_hit_team', api.create_fantasy_team(
 'f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',
 'Free Hit Progression',current_setting('test.fantasy_selection')::jsonb,'fa000000-0000-4000-8000-000000000002')->>'id',true);
select api.activate_fantasy_chip(current_setting('test.free_hit_team')::uuid,'f6400000-0000-4000-8000-000000000001','free_hit',1,'fa000000-0000-4000-8000-000000000003');
select api.confirm_fantasy_transfers(current_setting('test.free_hit_team')::uuid,'f6400000-0000-4000-8000-000000000001',
 '[{"player_out_id":"f7000013-0000-4000-8000-000000000001","player_in_id":"f7000016-0000-4000-8000-000000000001"}]',
 2,'fa000000-0000-4000-8000-000000000004','free_hit');
select api.confirm_fantasy_transfers(current_setting('test.free_hit_team')::uuid,'f6400000-0000-4000-8000-000000000001',
 '[{"player_out_id":"f7000014-0000-4000-8000-000000000001","player_in_id":"f7000017-0000-4000-8000-000000000001"}]',
 3,'fa000000-0000-4000-8000-000000000005','free_hit');
reset role;
select extensions.is((select count(*)::integer from app.fantasy_free_hit_snapshot_players),15,'two Free Hit batches preserve only the original 15 members');
select extensions.is((select count(*)::integer from app_private.fantasy_free_hit_lineup_snapshots),1,'Free Hit captures the original selection exactly once');
select extensions.is((select count(*)::integer from app.fantasy_squad_memberships where fantasy_team_id=current_setting('test.free_hit_team')::uuid and sold_at is null and fantasy_player_id in ('f7000016-0000-4000-8000-000000000001','f7000017-0000-4000-8000-000000000001')),2,'both temporary transfers were actually confirmed');
-- Different temporary captain choices must not replace the original selection.
update app.fantasy_lineup_players set captain=false,vice_captain=false where lineup_id in(select id from app.fantasy_lineups where fantasy_team_id=current_setting('test.free_hit_team')::uuid);
update app.fantasy_lineup_players set captain=(fantasy_player_id='f7000003-0000-4000-8000-000000000001'),vice_captain=(fantasy_player_id='f7000004-0000-4000-8000-000000000001') where lineup_id in(select id from app.fantasy_lineups where fantasy_team_id=current_setting('test.free_hit_team')::uuid);

-- ===========================================================================
-- Staged SofaScore statistics: schedule, modes, close on provisional points,
-- re-scoring, lock only when every match is FINAL or FINAL_LIMITED.
-- ===========================================================================
create function pg_temp.fx(i integer) returns uuid language sql immutable as $$
  select ('fa100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid $$;
create function pg_temp.club(i integer) returns uuid language sql immutable as $$
  select ('f4' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid $$;
create function pg_temp.fplayer(i integer) returns uuid language sql immutable as $$
  select ('f5' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid $$;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update app.fantasy_lineups set locked_at = statement_timestamp();
update app.fantasy_gameweeks set status = 'provisional' where id = 'f6400000-0000-4000-8000-000000000001';

insert into app.fixtures(id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status,
  home_score, away_score, provider_updated_at, source_sequence, source_version, finalized_at)
select pg_temp.fx(i), 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001', pg_temp.club(2 * i - 1), pg_temp.club(2 * i),
  '2090-01-01T12:00:00Z', 'finished', 0, 0, '2090-01-01T14:00:00Z', 10, 'staged-test-v1', '2090-01-01T14:00:00Z'
from generate_series(1, 8) i;
insert into app.fantasy_fixture_assignments(fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, frozen_at, source_version)
select 'f6300000-0000-4000-8000-000000000001', pg_temp.fx(i), 'f6400000-0000-4000-8000-000000000001',
  'f6400000-0000-4000-8000-000000000001', '2090-01-01T12:00:00Z', '2090-01-01T12:00:00Z', '2090-01-01T10:00:00Z', 1
from generate_series(1, 8) i;
insert into app_private.football_provider_mappings(provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
select 'sofascore', 'fixture', (9100 + i)::text, pg_temp.fx(i), 'test', now() from generate_series(1, 8) i;

-- The next gameweek, staged and complete (8 fixtures for the 16 clubs).
insert into app.rounds(id, season_id, round_number, name, status)
values ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 2, 'Next round', 'planned');
insert into app.fantasy_gameweeks(id, fantasy_season_id, football_round_id, sequence_number, name, deadline_at, starts_at, ends_at, status)
values ('f6400000-0000-4000-8000-000000000002', 'f6300000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000002', 2, 'Next week',
  app_private.fantasy_calculate_deadline('f6100000-0000-4000-8000-000000000100', '2090-01-10T12:00:00Z'),
  '2090-01-10T12:00:00Z', '2090-01-12T12:00:00Z', 'scheduled');
insert into app.fixtures(id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status,
  provider_updated_at, source_sequence, source_version)
select ('fb000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'f1000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002',
  pg_temp.club(i * 2 - 1), pg_temp.club(i * 2), '2090-01-10T12:00:00Z', 'scheduled', '2089-12-01T12:00:00Z', 1, 'staged-test-v1'
from generate_series(1, 8) i;
insert into app.fantasy_fixture_assignments(fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, source_version)
select 'f6300000-0000-4000-8000-000000000001', id, 'f6400000-0000-4000-8000-000000000002',
  'f6400000-0000-4000-8000-000000000002', kickoff_at, kickoff_at, 1
from app.fixtures where round_id = 'f3000000-0000-4000-8000-000000000002';

create function pg_temp.recorder_error(fixture uuid) returns text language plpgsql as $$
begin
  perform api.service_record_fantasy_observation(fixture, jsonb_build_object('homeScore', 0, 'awayScore', 0,
    'references', jsonb_build_array('x'),
    'players', (select jsonb_agg(jsonb_build_object('playerId', gen_random_uuid())) from generate_series(1, 18))), 'reviewed-correction');
  return 'no_error';
exception when others then return sqlerrm; end $$;

-- Observation builders (what the recorder would have stored for a SofaScore match).
create function pg_temp.player_row(n integer, cov text, assists integer) returns jsonb language sql stable as $$
  select jsonb_build_object('playerId', pg_temp.fplayer(n), 'teamId', pg_temp.club(((n - 1) % 16) + 1), 'started', true,
    'stats', jsonb_build_object('minutes', 90, 'goals', 0, 'cleanSheet', true, 'goalsConceded', 0, 'yellowCards', 0,
      'redCards', 0, 'secondYellowDismissals', 0, 'ownGoals', 0)
      || case when cov = 'full' then jsonb_build_object('assists', assists, 'saves', 0, 'penaltiesSaved', 0, 'penaltiesMissed', 0)
              else '{}'::jsonb end,
    'evidence', (select jsonb_object_agg(f, jsonb_build_object(
        'state', case when cov = 'full' or f in ('minutes', 'goals', 'cleanSheet', 'goalsConceded', 'yellowCards',
          'redCards', 'secondYellowDismissals', 'ownGoals') then 'verified' else 'unknown' end,
        'source', 'sofascore', 'observedAt', statement_timestamp(), 'references', jsonb_build_array('sofascore:event')))
      from unnest(array['minutes', 'goals', 'cleanSheet', 'goalsConceded', 'yellowCards', 'redCards',
        'secondYellowDismissals', 'ownGoals', 'assists', 'saves', 'penaltiesSaved', 'penaltiesMissed']) f)) $$;
create function pg_temp.obs_payload(fixture integer, cov text, assists integer) returns jsonb language sql stable as $$
  select jsonb_build_object('homeScore', 0, 'awayScore', 0, 'participationComplete', true, 'disciplineComplete', true,
    'references', jsonb_build_array('sofascore:event:' || (9100 + fixture)), 'verifiedNonParticipants', '[]'::jsonb,
    'anonymousStarters', 0, 'anonymousByTeam', '{}'::jsonb,
    'players', (select jsonb_agg(pg_temp.player_row(n, cov, case when n = 8 then assists else 0 end) order by n)
      from unnest(case when fixture = 1 then array[1, 2, 17] else array[2 * fixture - 1, 2 * fixture] end) n),
    'sourceRefs', jsonb_build_object('sofascoreEventId', (9100 + fixture)::text,
      'coverage', case cov when 'full' then 'full' else 'limited' end)) $$;
create function pg_temp.observe(fixture integer, cov text, assists integer default 0) returns bigint language sql as $$
  insert into app_private.fantasy_fixture_observations(fixture_id, source, digest, payload, full_ready, simple_ready)
  select pg_temp.fx(fixture), 'provider-reconciled',
    encode(extensions.digest(pg_temp.obs_payload(fixture, cov, assists)::text || clock_timestamp()::text, 'sha256'), 'hex'),
    pg_temp.obs_payload(fixture, cov, assists), cov = 'full', true
  returning id $$;

-- Fake worker results: appearance 2, 3 per assist in full mode. The database
-- validates structure and totals, the point values are the TypeScript scorer's.
create function pg_temp.row_points(p jsonb) returns integer language sql immutable as $$
  select 2 + case when p ->> 'scoringMode' = 'full' then 3 * coalesce((p #>> '{stats,assists}')::integer, 0) else 0 end $$;
create function pg_temp.player_results(snap jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('fantasyPlayerId', p ->> 'fantasyPlayerId', 'fixtureId', p ->> 'fixtureId', 'events', (
    select jsonb_agg(jsonb_build_object('category', c,
      'points', case c when 'appearance' then 2 when 'assist' then 3 * coalesce((p #>> '{stats,assists}')::integer, 0) else 0 end,
      'sourceKey', 'fixture-stats:' || (p ->> 'fixtureId') || ':' || (p ->> 'playerId') || ':' || c) order by c)
    from unnest(case when p ->> 'scoringMode' = 'simple'
      then array['appearance', 'goal', 'clean_sheet', 'goals_conceded', 'yellow_card', 'red_card', 'second_yellow_dismissal', 'own_goal']
      else array['appearance', 'goal', 'assist', 'clean_sheet', 'goals_conceded', 'saves', 'penalty_save', 'penalty_miss',
        'yellow_card', 'red_card', 'second_yellow_dismissal', 'own_goal'] end) c))), '[]'::jsonb)
  from jsonb_array_elements(snap -> 'playerFixtures') p $$;
create function pg_temp.team_results(snap jsonb) returns jsonb language sql stable as $$
  with pp as (select p ->> 'fantasyPlayerId' fp, sum(pg_temp.row_points(p))::integer pts
              from jsonb_array_elements(snap -> 'playerFixtures') p group by 1),
  t as (
    select team ->> 'teamId' team_id, team ->> 'lineupId' lineup_id,
      (select lp.fantasy_player_id from app.fantasy_lineup_players lp join pp on pp.fp = lp.fantasy_player_id::text
        where lp.lineup_id = (team ->> 'lineupId')::uuid and (lp.captain or lp.vice_captain)
        order by lp.captain desc limit 1) eff,
      (select coalesce(sum(b.point_hit), 0) from app.fantasy_transfer_batches b
        where b.fantasy_team_id = (team ->> 'teamId')::uuid and b.gameweek_id = (snap ->> 'gameweekId')::uuid
          and b.status = 'confirmed')::integer hit
    from jsonb_array_elements(snap -> 'teams') team)
  select coalesce(jsonb_agg(jsonb_build_object('teamId', t.team_id, 'lineupId', t.lineup_id,
    'startingPoints', s.starting, 'benchPoints', s.bench,
    'captainPoints', coalesce((select pp.pts from pp where pp.fp = t.eff::text), 0),
    'transferHit', t.hit,
    'provisionalScore', s.starting + coalesce((select pp.pts from pp where pp.fp = t.eff::text), 0) - t.hit,
    'effectiveCaptainId', t.eff, 'substitutions', '[]'::jsonb,
    'players', (select jsonb_agg(jsonb_build_object('fantasyPlayerId', lp.fantasy_player_id,
        'multiplier', case when lp.slot = 'bench' then 0 when lp.fantasy_player_id = t.eff then 2 else 1 end))
      from app.fantasy_lineup_players lp where lp.lineup_id = t.lineup_id::uuid))), '[]'::jsonb)
  from t cross join lateral (
    select coalesce(sum(pp.pts) filter (where lp.slot = 'starter'), 0)::integer starting,
           coalesce(sum(pp.pts) filter (where lp.slot = 'bench'), 0)::integer bench
    from app.fantasy_lineup_players lp left join pp on pp.fp = lp.fantasy_player_id::text
    where lp.lineup_id = t.lineup_id::uuid) s $$;
-- One worker scoring pass: prepare, snapshot, persist, rankings.
create function pg_temp.score(gw uuid) returns jsonb language plpgsql as $$
declare v bigint; snap jsonb; l uuid;
begin
  v := (api.service_prepare_fantasy_live_scoring(gw) ->> 'calculationVersion')::bigint;
  snap := api.service_get_fantasy_scoring_snapshot(gw, v, null, 100);
  perform api.service_persist_fantasy_scoring_results(gw, v, snap ->> 'inputDigest',
    pg_temp.player_results(snap), pg_temp.team_results(snap));
  perform api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001', gw, null, v);
  perform api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001', null, null, v);
  for l in select id from app.fantasy_leagues loop
    perform api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001', gw, l, v);
    perform api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001', null, l, v);
  end loop;
  return jsonb_build_object('version', v, 'digest', snap ->> 'inputDigest');
end $$;

-- A mini league with both teams.
insert into app.fantasy_leagues(id, fantasy_season_id, owner_user_id, name, visibility)
values ('fc000000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000001', 'Staged League', 'public');
insert into app.fantasy_league_memberships(league_id, fantasy_team_id, user_id, role)
values ('fc000000-0000-4000-8000-000000000001', current_setting('test.normal_team')::uuid,
  'f8000000-0000-4000-8000-000000000001', 'owner'),
 ('fc000000-0000-4000-8000-000000000001', current_setting('test.free_hit_team')::uuid,
  'f8000000-0000-4000-8000-000000000002', 'member');

-- Privileges and defaults ---------------------------------------------------
select extensions.ok(not has_function_privilege('authenticated', 'api.service_sofascore_staged_record_pull(uuid,jsonb)', 'execute'),
  'users cannot record a pull');
select extensions.ok(not has_function_privilege('anon', 'api.service_begin_fantasy_close(uuid,bigint,text)', 'execute'),
  'anon cannot close a gameweek');
select extensions.ok(not has_function_privilege('anon', 'api.admin_sofascore_final_limited()', 'execute'),
  'the FINAL_LIMITED view is not public');
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'app_private.sofascore_staged_stats'::regclass),
  'staged state forces RLS');
select extensions.throws_ok($$select app_private.fantasy_staged_stats_configure('f6300000-0000-4000-8000-000000000001', true, 1)$$,
  'PT409', 'fantasy_staged_stats_prerequisites_missing', 'staged stats need adaptive and live scoring first');

insert into app_private.fantasy_adaptive_policy(season_id, from_gameweek, ruleset_id)
values ('f6300000-0000-4000-8000-000000000001', 1, 'f6200000-0000-4000-8000-000000000200');
insert into app_private.fantasy_live_scoring_policy(season_id, enabled) values ('f6300000-0000-4000-8000-000000000001', true);

-- Switched off by default: the old mode rules apply, nothing is registered as staged.
select extensions.is(app_private.fantasy_staged_enabled('f6400000-0000-4000-8000-000000000001'), false, 'staged stats are off by default');
select app_private.fantasy_staged_stats_configure('f6300000-0000-4000-8000-000000000001', true, 1);
select extensions.is(app_private.fantasy_staged_enabled('f6400000-0000-4000-8000-000000000001'), true, 'owner switch turns the season on');

-- 1. First pull: the first observation registers the match --------------------
select pg_temp.observe(i, 'core') from generate_series(1, 8) i;
select extensions.is((select count(*)::integer from app_private.sofascore_staged_stats where status = 'PROVISIONAL' and coverage = 'core'), 8,
  'eight matches registered PROVISIONAL with core coverage');
select extensions.is((select count(*)::integer from app_private.sofascore_stat_pulls where outcome = 'first'), 8, 'first pulls are traced');
select extensions.ok((select bool_and(next_pull_at between first_pull_at + interval '3 days' - interval '1 second'
    and first_pull_at + interval '3 days' + interval '1 second') from app_private.sofascore_staged_stats),
  'the next pull is 3 days after the first');
select extensions.is(api.service_sofascore_staged_due(10) -> 'due', '[]'::jsonb, 'nothing is due before 3 days');

-- 2. Scoring layers: core points at once, rich fields unknown --------------------
select extensions.throws_ok($$select api.service_begin_fantasy_close('f6400000-0000-4000-8000-000000000001', 1, repeat('a', 64))$$,
  'PT409', 'fantasy_close_core_data_pending', 'a gameweek without selected modes cannot close');
select extensions.is(api.service_select_fantasy_scoring_modes('f6400000-0000-4000-8000-000000000001') ->> 'selected', '8',
  'core data selects simple mode at once, no 12 hour wait');
select extensions.is((select count(*)::integer from app_private.fantasy_fixture_scoring_modes where mode = 'simple'), 8, 'all matches score in simple mode');
select set_config('test.s1', pg_temp.score('f6400000-0000-4000-8000-000000000001')::text, true);
select extensions.is((select count(*)::integer from app.fantasy_player_point_events
  where gameweek_id = 'f6400000-0000-4000-8000-000000000001' and superseded_at is null and category = 'assist'), 0,
  'rich categories are absent from the ledger (unknown), not zero');
select extensions.is((select count(*)::integer from app.fantasy_player_point_events
  where gameweek_id = 'f6400000-0000-4000-8000-000000000001' and superseded_at is null and category = 'appearance'), 17,
  'core categories are scored');
select extensions.is((select provisional_score from app.fantasy_team_gameweek_results where fantasy_team_id = current_setting('test.normal_team')::uuid), 24,
  'team total from core points (11 x 2 + captain 2)');
select extensions.throws_ok($$select api.service_begin_fantasy_finalization('f6400000-0000-4000-8000-000000000001', 1, repeat('a', 64))$$,
  'PT409', 'fantasy_staged_stats_not_final', 'provisional matches cannot lock the gameweek');

-- 3. Close on provisional points, open the next gameweek -------------------------
select extensions.is(api.service_begin_fantasy_close('f6400000-0000-4000-8000-000000000001',
  (current_setting('test.s1')::jsonb ->> 'version')::bigint, current_setting('test.s1')::jsonb ->> 'digest') ->> 'closed', 'true',
  'every match has core data: the gameweek closes');
select extensions.is((select status::text from app.fantasy_gameweeks where id = 'f6400000-0000-4000-8000-000000000001'), 'provisional',
  'a closed gameweek stays provisional');
select extensions.is((select points_state::text from app.fantasy_gameweeks where id = 'f6400000-0000-4000-8000-000000000001'), 'provisional',
  'and its points stay provisional');
select extensions.throws_ok($$select api.service_prepare_next_fantasy_gameweek('f6400000-0000-4000-8000-000000000001', 'f6400000-0000-4000-8000-000000000002', 1, 100)$$,
  'PT409', 'fantasy_previous_postwork_incomplete', 'the next gameweek waits for the close carry-over');
select api.service_restore_free_hit('f6400000-0000-4000-8000-000000000001', 100);
select extensions.is((select count(*)::integer from app.fantasy_squad_memberships where fantasy_team_id = current_setting('test.free_hit_team')::uuid and sold_at is null), 15,
  'Free Hit squad restored at close');
select api.service_roll_fantasy_free_transfers('f6400000-0000-4000-8000-000000000001', 100);
select extensions.is((select count(*)::integer from app_private.fantasy_free_transfer_rollovers where gameweek_id = 'f6400000-0000-4000-8000-000000000001'), 2,
  'free transfers rolled at close');
select extensions.throws_ok($$select api.service_complete_fantasy_close('f6400000-0000-4000-8000-000000000001', 1)$$,
  'PT409', null, 'close is not complete before prices');
select api.service_run_fantasy_close_price_batch('f6400000-0000-4000-8000-000000000001',
  (current_setting('test.s1')::jsonb ->> 'version')::bigint, null, 1000);
select extensions.is((select prices_completed_at is not null from app_private.fantasy_gameweek_close), true, 'prices applied at close');
select set_config('test.price_rows', (select count(*)::text from app.fantasy_player_price_history where source_version = 2), true);
select extensions.ok((select price_last_response is not null from app_private.fantasy_gameweek_close), 'price pass journaled at close');
select extensions.is(api.service_complete_fantasy_close('f6400000-0000-4000-8000-000000000001',
  (current_setting('test.s1')::jsonb ->> 'version')::bigint) ->> 'completed', 'true', 'close carry-over complete');
select app_private.fantasy_automation_configure(true);
select extensions.is(app_private.fantasy_lifecycle_tick(), 'ok', 'the database tick opens the next gameweek after a closed one');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is((select status::text from app.fantasy_gameweeks where id = 'f6400000-0000-4000-8000-000000000002'), 'open', 'the next gameweek opens on provisional points');
select extensions.is((select count(*)::integer from app.fantasy_teams where current_gameweek_id = 'f6400000-0000-4000-8000-000000000002'), 2,
  'both teams moved on');
select extensions.is((select count(*)::integer from app.fantasy_lineup_players lp join app.fantasy_lineups l on l.id = lp.lineup_id
  where l.gameweek_id = 'f6400000-0000-4000-8000-000000000002'), 30, 'next lineups carried');

-- What must wait for the lock does.
select extensions.is((select count(*)::integer from app_private.fantasy_gameweek_postwork), 0, 'no finalized postwork at close');
select extensions.throws_ok($$select api.service_enqueue_gameweek_finalized_notifications('f6400000-0000-4000-8000-000000000001', 1, null, 100)$$,
  'PT409', 'gameweek_not_finalizable', 'finalized notifications wait for the lock');
select extensions.is((select count(*)::integer from app_private.notification_events where event_type = 'gameweek_finalized'), 0,
  'no finalized notification at close');
select extensions.lives_ok($$select api.service_evaluate_fantasy_prizes(10)$$, 'prize pass runs');
select extensions.is((select count(*)::integer from app.fantasy_prize_winners), 0, 'no prize is awarded on provisional points');
select extensions.is((select count(*)::integer from app.fantasy_lineups where gameweek_id = 'f6400000-0000-4000-8000-000000000001' and finalized_at is not null), 0,
  'lineups are not finalized at close');
select extensions.is((select count(*)::integer from app.fantasy_team_gameweek_results where gameweek_id = 'f6400000-0000-4000-8000-000000000001' and state = 'provisional'), 2,
  'team results stay provisional');
select extensions.is(app_private.fantasy_staged_lock_blocker('f6400000-0000-4000-8000-000000000002'), 'fantasy_previous_gameweek_not_locked',
  'a later gameweek cannot lock before the earlier one');
select extensions.is(api.service_fantasy_lifecycle_state('f6400000-0000-4000-8000-000000000001') ->> 'stagedLockBlocker', 'fantasy_staged_stats_not_final',
  'the worker is told why the lock waits');

-- 4. Later observations are accepted and re-score the closed gameweek -------------
select extensions.isnt(pg_temp.recorder_error(pg_temp.fx(4)), 'adaptive_reviewed_correction_required',
  'the recorder still accepts observations for a closed gameweek');

-- Full statistics arrive for match 4 (the captain's): the pull is due, recorded, upgrades the mode.
update app_private.sofascore_staged_stats set next_pull_at = now() - interval '1 minute' where fixture_id = pg_temp.fx(4);
select extensions.is(api.service_sofascore_staged_due(10) -> 'due' -> 0 ->> 'fixtureId', pg_temp.fx(4)::text, 'the match is due after 3 days');
select extensions.is(jsonb_array_length(api.service_sofascore_staged_due(10) -> 'due'), 1, 'only that match is due');
insert into app_private.rapidapi_call_counts(day, job, endpoint, status_code, calls)
values (current_date, 'fixtures', 'matches/get-lineups', 200, 9000);
select extensions.is(api.service_sofascore_staged_due(10) ->> 'budgetStopped', 'true', 'no re-pull once the month reached 9,000 calls');
delete from app_private.rapidapi_call_counts where calls = 9000;
select set_config('test.obs4', pg_temp.observe(4, 'full', 1)::text, true);
select extensions.is(api.service_sofascore_staged_record_pull(pg_temp.fx(4), jsonb_build_object('outcome', 'pulled', 'coverage', 'full',
  'dataDigest', repeat('b', 64), 'observationId', current_setting('test.obs4')::bigint, 'requests', 3,
  'matchData', jsonb_build_object('version', 1))) ->> 'coverage', 'full', 'full coverage recorded');
select extensions.is((select status from app_private.sofascore_staged_stats where fixture_id = pg_temp.fx(4)), 'PROVISIONAL', 'one full pull is not final: the final pull comes 3 days later');
select extensions.ok((select full_at is not null and next_pull_at between full_at + interval '3 days' - interval '1 second'
  and full_at + interval '3 days' + interval '1 second' from app_private.sofascore_staged_stats where fixture_id = pg_temp.fx(4)),
  'the final pull is due 3 days after full coverage');
select extensions.is((select changed from app_private.sofascore_stat_pulls where fixture_id = pg_temp.fx(4) and outcome = 'pulled'), true, 'changed data is flagged');
select extensions.is((select (match_data ->> 'version')::integer from app_private.sofascore_stat_pulls where fixture_id = pg_temp.fx(4) and outcome = 'pulled'), 1,
  'trimmed parsed data kept when the digest changed');
select extensions.is(api.service_select_fantasy_scoring_modes('f6400000-0000-4000-8000-000000000001') ->> 'upgraded', '1', 'full coverage upgrades one match');
select extensions.is((select mode from app_private.fantasy_fixture_scoring_modes where fixture_id = pg_temp.fx(4)), 'full', 'simple -> full');
select extensions.is((select mode from app_private.fantasy_fixture_scoring_modes where fixture_id = pg_temp.fx(5)), 'simple', 'other matches stay simple');
select extensions.is((select count(*)::integer from app_private.fantasy_fixture_mode_changes), 1, 'the upgrade is traced');
select extensions.is(api.service_select_fantasy_scoring_modes('f6400000-0000-4000-8000-000000000001') ->> 'upgraded', '0', 'upgrade is idempotent');
select extensions.is(api.service_fantasy_lifecycle_state('f6400000-0000-4000-8000-000000000001') ->> 'stagedRescoreNeeded', 'true',
  'the worker is told the closed gameweek needs re-scoring');
select set_config('test.s2', pg_temp.score('f6400000-0000-4000-8000-000000000001')::text, true);
select extensions.ok((current_setting('test.s2')::jsonb ->> 'version')::bigint > (current_setting('test.s1')::jsonb ->> 'version')::bigint, 'a new calculation version');
select extensions.is((select provisional_points from app.fantasy_player_gameweek_points
  where gameweek_id = 'f6400000-0000-4000-8000-000000000001' and fantasy_player_id = 'f7000008-0000-4000-8000-000000000001'), 5,
  'the player is re-scored (appearance 2 + assist 3, unknown became known)');
select extensions.is((select provisional_score from app.fantasy_team_gameweek_results where fantasy_team_id = current_setting('test.normal_team')::uuid), 30,
  'team total recomputed (captain doubles the new points)');
select extensions.is((select provisional_score from app.fantasy_team_gameweek_results where fantasy_team_id = current_setting('test.free_hit_team')::uuid), 27,
  'the other team recomputed');
select extensions.is((select gameweek_points from app.fantasy_rankings where gameweek_id = 'f6400000-0000-4000-8000-000000000001'
  and league_id is null and fantasy_team_id = current_setting('test.normal_team')::uuid), 30, 'gameweek ranking follows');
select extensions.is((select rank::integer from app.fantasy_rankings where gameweek_id is null and league_id is null
  and fantasy_team_id = current_setting('test.normal_team')::uuid), 1, 'overall ranking follows');
select extensions.is((select total_points from app.fantasy_rankings where gameweek_id is null and league_id = 'fc000000-0000-4000-8000-000000000001'
  and fantasy_team_id = current_setting('test.free_hit_team')::uuid), 27, 'league table follows');
select extensions.is((select rank::integer from app.fantasy_rankings where gameweek_id is null and league_id = 'fc000000-0000-4000-8000-000000000001'
  and fantasy_team_id = current_setting('test.free_hit_team')::uuid), 2, 'league rank follows');
select extensions.is((select status::text from app.fantasy_gameweeks where id = 'f6400000-0000-4000-8000-000000000002'), 'open', 'the next gameweek is unaffected');
select extensions.is(api.service_fantasy_lifecycle_state('f6400000-0000-4000-8000-000000000001') ->> 'stagedRescoreNeeded', 'false', 'no re-score needed once published');

-- An unchanged or worse pull.
select extensions.is(api.service_sofascore_staged_record_pull(pg_temp.fx(4), jsonb_build_object('outcome', 'pulled', 'coverage', 'full',
  'dataDigest', repeat('b', 64), 'requests', 3)) ->> 'changed', 'false', 'an identical pull is not a change');
select extensions.is((select status from app_private.sofascore_staged_stats where fixture_id = pg_temp.fx(4)), 'PROVISIONAL', 'an early extra full pull does not settle');
select extensions.is(api.service_sofascore_staged_record_pull(pg_temp.fx(4), jsonb_build_object('outcome', 'pulled', 'coverage', 'core',
  'regressed', true, 'dataDigest', repeat('c', 64), 'requests', 3)) ->> 'coverage', 'full', 'a regressed pull never lowers the coverage');
select extensions.is((select count(*)::integer from app_private.sofascore_stat_pulls where fixture_id = pg_temp.fx(4) and outcome = 'regressed'), 1, 'the regression is traced');
select extensions.ok((select full_at is not null from app_private.sofascore_staged_stats where fixture_id = pg_temp.fx(4)), 'and full_at is kept');
select extensions.is(api.service_sofascore_staged_record_pull(pg_temp.fx(6), jsonb_build_object('outcome', 'error', 'error', 'provider_rate_limited', 'requests', 1)) ->> 'status',
  'PROVISIONAL', 'a failed fetch changes no status');
select extensions.is((select failed_attempts from app_private.sofascore_staged_stats where fixture_id = pg_temp.fx(6)), 1, 'but is counted');
select extensions.ok((select next_pull_at between now() + interval '2 hours' and now() + interval '4 hours' from app_private.sofascore_staged_stats where fixture_id = pg_temp.fx(6)),
  'and retried in 3 hours');
select extensions.is(api.service_sofascore_staged_record_pull(pg_temp.fx(7), jsonb_build_object('outcome', 'pulled', 'coverage', 'core',
  'dataDigest', repeat('d', 64), 'requests', 3)) ->> 'status', 'PROVISIONAL', 'a core pull keeps the match provisional');
select extensions.ok((select next_pull_at between now() + interval '3 days' - interval '1 minute' and now() + interval '3 days' + interval '1 minute'
  from app_private.sofascore_staged_stats where fixture_id = pg_temp.fx(7)), 're-pull every 3 days');

-- 5. Settling: FINAL_LIMITED at 21 days, FINAL after the final pull ---------------
update app_private.sofascore_staged_stats set kickoff_at = now() - interval '20 days' where fixture_id <> pg_temp.fx(4);
select api.service_sofascore_staged_due(10);
select extensions.is((select count(*)::integer from app_private.sofascore_staged_stats where status = 'PROVISIONAL'), 8, 'at 20 days nothing is settled');
select extensions.throws_ok($$select api.service_begin_fantasy_finalization('f6400000-0000-4000-8000-000000000001', 1, repeat('a', 64))$$,
  'PT409', 'fantasy_staged_stats_not_final', 'still not lockable');
update app_private.sofascore_staged_stats set kickoff_at = now() - interval '22 days' where fixture_id <> pg_temp.fx(4);
select api.service_sofascore_staged_due(10);
select extensions.is((select count(*)::integer from app_private.sofascore_staged_stats where status = 'FINAL_LIMITED' and settled_reason = 'no_full_coverage_21d'), 7,
  'past 21 days without full coverage: FINAL_LIMITED');
select extensions.is((select count(*)::integer from app_private.sofascore_staged_stats where status = 'FINAL_LIMITED' and next_pull_at is not null), 0, 'and no more pulls');
select extensions.is(api.service_fantasy_lifecycle_state('f6400000-0000-4000-8000-000000000001') ->> 'stagedLockBlocker', 'fantasy_staged_stats_not_final',
  'one match is still waiting for its final pull');
update app_private.sofascore_staged_stats set full_at = now() - interval '4 days', next_pull_at = now() - interval '1 hour' where fixture_id = pg_temp.fx(4);
select extensions.is(api.service_sofascore_staged_record_pull(pg_temp.fx(4), jsonb_build_object('outcome', 'pulled', 'coverage', 'full',
  'dataDigest', repeat('b', 64), 'requests', 3)) ->> 'status', 'FINAL', 'the final pull settles the match FINAL');
select extensions.is((select settled_reason from app_private.sofascore_staged_stats where fixture_id = pg_temp.fx(4)), 'final_pull_done', 'with its reason');
select extensions.is(api.service_sofascore_staged_record_pull(pg_temp.fx(4), jsonb_build_object('outcome', 'pulled', 'coverage', 'full',
  'dataDigest', repeat('e', 64), 'requests', 3)) ->> 'ignored', 'true', 'a settled match ignores further pulls');
select extensions.is(api.service_sofascore_staged_due(10) -> 'due', '[]'::jsonb, 'and is never due again');
select extensions.is(api.service_fantasy_lifecycle_state('f6400000-0000-4000-8000-000000000001') ->> 'stagedLockBlocker', null, 'every match FINAL or FINAL_LIMITED: ready to lock');
select extensions.is((select c ->> 'status' from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c where c ->> 'name' = 'fantasy_staged_stats'), 'ok', 'health: a gameweek that just became lockable is fine');
update app_private.sofascore_staged_stats set settled_at = now() - interval '4 hours' where status <> 'PROVISIONAL';
select extensions.is((select c ->> 'status' from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c where c ->> 'name' = 'fantasy_staged_stats'), 'warn', 'health: warns 3 hours after every match settled');
update app_private.sofascore_staged_stats set settled_at = now() - interval '13 hours' where status <> 'PROVISIONAL';
select extensions.is((select c ->> 'status' from jsonb_array_elements(app_private.ops_health_checks() -> 'checks') c where c ->> 'name' = 'fantasy_staged_stats'), 'fail', 'health: fails 12 hours after');

-- Time based settling does not depend on a fetch: reviewed override and a missing final pull.
insert into app_private.sofascore_staged_stats(fixture_id, sofascore_event_id, kickoff_at, first_pull_at, coverage, next_pull_at)
select id, '77' || (row_number() over (order by id))::text, now() - interval '5 days', now() - interval '5 days', 'core', now() + interval '1 day'
from app.fixtures where round_id = 'f3000000-0000-4000-8000-000000000002' order by id limit 2;
insert into app_private.fantasy_fixture_observations(fixture_id, source, digest, payload, full_ready, simple_ready)
select fixture_id, 'reviewed-correction', repeat('f', 64), '{"reason":"reviewed by staff for the test"}', false, true
from (select fixture_id from app_private.sofascore_staged_stats where status = 'PROVISIONAL' order by fixture_id desc limit 1) q;
update app_private.sofascore_staged_stats set kickoff_at = now() - interval '29 days', full_at = now() - interval '10 days'
where fixture_id = (select fixture_id from app_private.sofascore_staged_stats where status = 'PROVISIONAL' order by fixture_id limit 1);
select app_private.sofascore_staged_settle_due(now());
select extensions.is((select count(*)::integer from app_private.sofascore_staged_stats where settled_reason = 'reviewed_override'), 1, 'a reviewed correction settles the match');
select extensions.is((select count(*)::integer from app_private.sofascore_staged_stats where settled_reason = 'final_pull_missing'), 1, 'a missing final pull settles at 28 days');

-- 6. Lock: the existing finalization, prices adopted, notifications and prizes now run ------
select set_config('test.s3', pg_temp.score('f6400000-0000-4000-8000-000000000001')::text, true);
select extensions.is(current_setting('test.s3')::jsonb ->> 'version', current_setting('test.s2')::jsonb ->> 'version', 'settling changes no points: same version');
select extensions.is(api.service_begin_fantasy_finalization('f6400000-0000-4000-8000-000000000001',
  (current_setting('test.s3')::jsonb ->> 'version')::bigint, current_setting('test.s3')::jsonb ->> 'digest') ->> 'sealed', 'true', 'the gameweek locks');
select extensions.is(pg_temp.recorder_error(pg_temp.fx(4)), 'adaptive_reviewed_correction_required', 'observations are refused after the lock');
select extensions.is(api.service_finalize_fantasy_team_results('f6400000-0000-4000-8000-000000000001',
  (current_setting('test.s3')::jsonb ->> 'version')::bigint, null, 100) ->> 'finalized', '2', 'results final');
select extensions.is(api.service_restore_free_hit('f6400000-0000-4000-8000-000000000001', 100) ->> 'restored', '0', 'free hit already restored');
select extensions.is(api.service_roll_fantasy_free_transfers('f6400000-0000-4000-8000-000000000001', 100) ->> 'updated', '0', 'free transfers already rolled');
select api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001', 'f6400000-0000-4000-8000-000000000001', null,
  (current_setting('test.s3')::jsonb ->> 'version')::bigint);
select api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001', null, null,
  (current_setting('test.s3')::jsonb ->> 'version')::bigint);
select api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001', 'f6400000-0000-4000-8000-000000000001',
  'fc000000-0000-4000-8000-000000000001', (current_setting('test.s3')::jsonb ->> 'version')::bigint);
select api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001', null,
  'fc000000-0000-4000-8000-000000000001', (current_setting('test.s3')::jsonb ->> 'version')::bigint);
select extensions.is(api.service_complete_fantasy_gameweek('f6400000-0000-4000-8000-000000000001',
  (current_setting('test.s3')::jsonb ->> 'version')::bigint) ->> 'finalized', 'true', 'the existing completion accepts a gameweek that closed earlier');
select extensions.is((select points_state::text from app.fantasy_gameweeks where id = 'f6400000-0000-4000-8000-000000000001'), 'final', 'points are final at the lock');
select extensions.is((select final_score from app.fantasy_team_gameweek_results where fantasy_team_id = current_setting('test.normal_team')::uuid), 30,
  'final score equals the last provisional one');
select extensions.is((select count(*)::integer from app_private.notification_events where event_type = 'gameweek_finalized'), 0,
  'finalized notifications still wait for postwork');
select extensions.is(api.service_fantasy_lifecycle_state('f6400000-0000-4000-8000-000000000001') ->> 'postworkCompleted', 'false', 'postwork owed');
select extensions.is(api.service_adopt_fantasy_close_prices('f6400000-0000-4000-8000-000000000001',
  (current_setting('test.s3')::jsonb ->> 'version')::bigint) ->> 'adopted', 'true', 'the close price pass is adopted');
select extensions.is(api.service_run_fantasy_price_batch('f6400000-0000-4000-8000-000000000001',
  (current_setting('test.s3')::jsonb ->> 'version')::bigint) ->> 'hasMore', 'false', 'the postwork price pass is a no-op');
select extensions.is((select count(*)::text from app.fantasy_player_price_history where source_version = 2), current_setting('test.price_rows'), 'prices were applied exactly once');
select extensions.is(api.service_enqueue_gameweek_finalized_notifications('f6400000-0000-4000-8000-000000000001',
  (current_setting('test.s3')::jsonb ->> 'version')::bigint, null, 100) ->> 'hasMore', 'false', 'finalized notifications run at the lock');
select extensions.is((select count(*)::integer from app_private.notification_events where event_type = 'gameweek_finalized'), 2, 'one per team');
select extensions.is(api.service_complete_fantasy_postwork('f6400000-0000-4000-8000-000000000001',
  (current_setting('test.s3')::jsonb ->> 'version')::bigint) ->> 'completed', 'true', 'postwork completes');
select extensions.is(api.service_prepare_next_fantasy_gameweek('f6400000-0000-4000-8000-000000000001', 'f6400000-0000-4000-8000-000000000002',
  (current_setting('test.s3')::jsonb ->> 'version')::bigint, 100) ->> 'alreadyAdvanced', 'true',
  'the opening done at close is not repeated at the lock');
select extensions.lives_ok($$select api.service_evaluate_fantasy_prizes(10)$$, 'prizes are evaluated after the lock');
select extensions.is(app_private.fantasy_staged_lock_blocker('f6400000-0000-4000-8000-000000000002'), 'fantasy_staged_stats_not_final',
  'the next gameweek can only lock once the previous one is locked and its own matches are final');

-- Seasons without the switch keep the old behaviour.
select app_private.fantasy_staged_stats_configure('f6300000-0000-4000-8000-000000000001', false, 1);
select extensions.is(app_private.fantasy_staged_lock_blocker('f6400000-0000-4000-8000-000000000002'), null, 'switched off: no staged gate');
select extensions.is(api.service_select_fantasy_scoring_modes('f6400000-0000-4000-8000-000000000002') ->> 'staged', null, 'switched off: the old mode function answers');
select * from extensions.finish();
rollback;
