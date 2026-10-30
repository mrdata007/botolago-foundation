-- Independent adversarial tests for the publication gate (20261030100000..300),
-- written by the Tester, not the Builder. The three former TODO gaps (F1, F2) are
-- now real checks.
--
-- Times are relative to the day before the test runs (D0), so the test never
-- ages: the journée's last match ended on D0 at 22:00 Moroccan time, hence its
-- publication slot is D0 + 2 days at 14:00 Moroccan time, always in the future.
-- The rule is exercised at chosen moments through
-- app_private.fantasy_publication_evaluate_at(gameweek, now).
begin;

select extensions.no_plan();
select set_config('test.next_kickoff',(statement_timestamp()+interval '20 hours')::text,true);
-- D0 at 20:00 Moroccan time (kickoff) and 22:00 (final whistle).
select set_config('test.kickoff',app_private.morocco_instant(
  date_trunc('day',app_private.morocco_local(now()))-interval '1 day'+interval '20 hours')::text,true);
select set_config('test.final',app_private.morocco_instant(
  date_trunc('day',app_private.morocco_local(now()))-interval '1 day'+interval '22 hours')::text,true);
select set_config('test.slot',app_private.morocco_instant(
  date_trunc('day',app_private.morocco_local(now()))+interval '1 day'+interval '14 hours')::text,true);

insert into app.countries (id, iso_alpha2, iso_alpha3) values
  ('f0000000-0000-4000-8000-000000000001', 'XZ', 'XZZ');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('f1000000-0000-4000-8000-000000000001', 'fantasy-test', 'Fantasy Test', 'FT', 'league',
  'f0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
  '2089/90', '2026-08-01', '2090-06-30', 'active', true);
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
  '2089/90', 'active', '2026-08-01', '2090-06-30');
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
    '{"username":"fantasy_one"}', statement_timestamp(), statement_timestamp());
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
    select id, row_number() over (order by id) as player_number from app.fantasy_players where fantasy_season_id='f6300000-0000-4000-8000-000000000001'
    order by id limit 15
  ) player
), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('test.team', api.create_fantasy_team(
 'f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',
 'Gate Team',current_setting('test.fantasy_selection')::jsonb,'fa000000-0000-4000-8000-000000000001')->>'id',true);
reset role;

create function pg_temp.fx(i integer) returns uuid language sql immutable as $$
  select ('fa100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid $$;
create function pg_temp.club(i integer) returns uuid language sql immutable as $$
  select ('f4' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid $$;
create function pg_temp.fplayer(i integer) returns uuid language sql immutable as $$
  select ('f5' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid $$;

create function pg_temp.ma(local_time text) returns timestamptz language sql immutable as $$
  select app_private.morocco_instant(local_time::timestamp) $$;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- The lineups locked two and a half hours before the kickoff.
update app.fantasy_lineups set locked_at = current_setting('test.kickoff')::timestamptz - interval '150 minutes'
  where gameweek_id='f6400000-0000-4000-8000-000000000001';
update app.fantasy_gameweeks set status = 'provisional',
  deadline_at = current_setting('test.kickoff')::timestamptz - interval '150 minutes',
  starts_at = current_setting('test.kickoff')::timestamptz - interval '1 hour',
  ends_at = current_setting('test.final')::timestamptz + interval '1 hour'
  where id = 'f6400000-0000-4000-8000-000000000001';
insert into app.fixtures(id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status,
  home_score, away_score, provider_updated_at, source_sequence, source_version, finalized_at)
select pg_temp.fx(i), 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001', pg_temp.club(2 * i - 1), pg_temp.club(2 * i),
  current_setting('test.kickoff')::timestamptz, 'finished', 0, 0,
  current_setting('test.final')::timestamptz, 10, 'gate-test-v1', current_setting('test.final')::timestamptz
from generate_series(1, 8) i;
insert into app.fantasy_fixture_assignments(fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, frozen_at, source_version)
select 'f6300000-0000-4000-8000-000000000001', pg_temp.fx(i), 'f6400000-0000-4000-8000-000000000001',
  'f6400000-0000-4000-8000-000000000001', current_setting('test.kickoff')::timestamptz,
  current_setting('test.kickoff')::timestamptz, current_setting('test.kickoff')::timestamptz - interval '150 minutes', 1
from generate_series(1, 8) i;
insert into app_private.football_provider_mappings(provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
select 'sofascore', 'fixture', (9100 + i)::text, pg_temp.fx(i), 'test', now() from generate_series(1, 8) i;
insert into app.rounds(id, season_id, round_number, name, status)
values ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 2, 'Next round', 'planned');
insert into app.fantasy_gameweeks(id, fantasy_season_id, football_round_id, sequence_number, name, deadline_at, starts_at, ends_at, status)
values ('f6400000-0000-4000-8000-000000000002', 'f6300000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000002', 2, 'Next week',
  app_private.fantasy_calculate_deadline('f6100000-0000-4000-8000-000000000100', current_setting('test.next_kickoff')::timestamptz),
  current_setting('test.next_kickoff')::timestamptz, current_setting('test.next_kickoff')::timestamptz+interval '6 hours', 'scheduled');
insert into app.fixtures(id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status,
  provider_updated_at, source_sequence, source_version)
select ('fb000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'f1000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002',
  pg_temp.club(i * 2 - 1), pg_temp.club(i * 2), current_setting('test.next_kickoff')::timestamptz, 'scheduled', '2089-12-01T12:00:00Z', 1, 'gate-test-v1'
from generate_series(1, 8) i;
insert into app.fantasy_fixture_assignments(fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, source_version)
select 'f6300000-0000-4000-8000-000000000001', id, 'f6400000-0000-4000-8000-000000000002',
  'f6400000-0000-4000-8000-000000000002', kickoff_at, kickoff_at, 1
from app.fixtures where round_id = 'f3000000-0000-4000-8000-000000000002';

insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at)
select 'sofascore','player',(100000+n)::text,pg_temp.fplayer(n),'gate-test',now()from generate_series(1,17)n;
insert into app_private.fantasy_api_rating_seasons(season_id,from_gameweek,owner_approval)
values('f6300000-0000-4000-8000-000000000001',1,'Test owner authorized native rating selection close');
insert into app_private.fantasy_live_scoring_policy(season_id,enabled)values('f6300000-0000-4000-8000-000000000001',true);
create function pg_temp.native_players(i integer,missing boolean)returns jsonb language sql immutable as $$
 with entries as(select n,side,jsonb_build_object('externalId',case when n=1 then(100000+2*i-2+side)::text
   else(200000+i*100+side*20+n)::text end,'side',case when side=1 then 'home'else 'away'end,
   'starter',true,'appeared',true,'uncertain',false,'minutes',90,'rating',6.5)entry
   from generate_series(1,11)n cross join generate_series(1,2)side
 union all select 12,1,jsonb_build_object('externalId','100017','side','home','starter',false,
   'appeared',true,'uncertain',false,'minutes',4,'rating',case when missing then null::numeric else 7.5 end)where i=1)
 select jsonb_agg(entry order by side,n)from entries;
$$;
-- One four-minute cameo has no rating yet.
select api.service_record_fantasy_api_ratings(pg_temp.fx(i),(9100+i)::text,pg_temp.native_players(i,true),statement_timestamp())from generate_series(1,8)i;


create function pg_temp.selection_player_results(d jsonb)returns jsonb language sql immutable as $$
 select jsonb_agg(jsonb_build_object('fantasyPlayerId',p->'fantasyPlayerId','fixtureId',p->'fixtureId',
 'events',jsonb_build_array(jsonb_build_object('category','rating','points',floor((p->>'rating')::numeric+0.5),
 'sourceKey','fixture-stats:'||(p->>'fixtureId')||':'||(p->>'playerId')||':rating'))))
 from jsonb_array_elements(d->'playerFixtures')p;
$$;
create function pg_temp.selection_team_results(d jsonb)returns jsonb language sql stable as $$
 with scores as(select (p->>'fantasyPlayerId')::uuid id,floor((p->>'rating')::numeric+0.5)::integer points
 from jsonb_array_elements(d->'playerFixtures')p),teams as(
 select l.fantasy_team_id,l.id as lineup_id,
 sum(s.points)filter(where lp.slot='starter')as starting,
 sum(s.points)filter(where lp.slot='bench')as bench,
 sum(s.points)filter(where lp.captain)as captain,
 (array_agg(lp.fantasy_player_id)filter(where lp.captain))[1]as captain_id,
 jsonb_agg(jsonb_build_object('fantasyPlayerId',lp.fantasy_player_id,
 'multiplier',case when lp.slot='bench'then 0 when lp.captain then 2 else 1 end))as players
 from app.fantasy_lineups l join app.fantasy_lineup_players lp on lp.lineup_id=l.id
 join scores s on s.id=lp.fantasy_player_id where l.gameweek_id='f6400000-0000-4000-8000-000000000001'
 group by l.fantasy_team_id,l.id)
 select jsonb_agg(jsonb_build_object('teamId',fantasy_team_id,'lineupId',lineup_id,
 'startingPoints',starting,'benchPoints',bench,'captainPoints',captain,'transferHit',0,
 'provisionalScore',starting+captain,'effectiveCaptainId',captain_id,'substitutions','[]'::jsonb,'players',players))from teams;
$$;

select set_config('request.jwt.claims','{"role":"service_role"}',true);
select current_setting('test.team') as team \gset

insert into app_private.fantasy_publication_settings(season_id,first_gameweek) values ('f6300000-0000-4000-8000-000000000001',1);
-- ===========================================================================
-- B. A counted match that is abandoned and never finishes. The publication
--    time can never be known. The health checks should still say so.
-- ===========================================================================
select set_config('app.allow_fixture_correction','on',true);
update app.fixtures set status='abandoned',finalized_at=null,source_sequence=99 where id=pg_temp.fx(3);
select extensions.is(app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000001'),null::timestamptz,'B: no publication time while a counted match is not finished');
select extensions.is(app_private.fantasy_publication_evaluate_at('f6400000-0000-4000-8000-000000000001',now()+interval '30 days')->>'outcome','matches_unfinished','B: it stays held');
select extensions.isnt(app_private.fantasy_publication_alarm_at('f6400000-0000-4000-8000-000000000001',now()+interval '30 days'),null,'B: an alarm after 30 days');
update app.fixtures set status='finished',finalized_at=current_setting('test.final')::timestamptz,source_sequence=100 where id=pg_temp.fx(3);
select set_config('app.allow_fixture_correction','off',true);
-- ===========================================================================
-- C. Released at the slot, then the worker never writes the points.
-- ===========================================================================
select api.service_record_fantasy_api_ratings(pg_temp.fx(1),'9101',pg_temp.native_players(1,false),statement_timestamp());
select extensions.is(app_private.fantasy_publication_evaluate_at('f6400000-0000-4000-8000-000000000001',current_setting('test.slot')::timestamptz)->>'outcome','released','C: released');
select extensions.ok(exists(select 1 from app_private.fantasy_unpublished_gameweeks),'C: still unpublished (nothing written)');
select extensions.isnt(app_private.fantasy_publication_alarm_at('f6400000-0000-4000-8000-000000000001',current_setting('test.slot')::timestamptz+interval '3 days'),null,'C: an alarm three days after the slot');
delete from app_private.fantasy_publication_state where gameweek_id='f6400000-0000-4000-8000-000000000001';
-- ===========================================================================
-- D. Points and rankings already written when the gate is switched on
--    (the migration applied while the journée has points).
-- ===========================================================================
update app_private.fantasy_publication_settings set first_gameweek=1000 where season_id='f6300000-0000-4000-8000-000000000001';
select api.service_record_fantasy_api_ratings(pg_temp.fx(1),'9101',pg_temp.native_players(1,false),statement_timestamp());
select set_config('test.v',api.service_prepare_fantasy_live_scoring('f6400000-0000-4000-8000-000000000001')->>'calculationVersion',true);
select set_config('test.snap',api.service_get_fantasy_scoring_snapshot('f6400000-0000-4000-8000-000000000001',current_setting('test.v')::bigint,null,100)::text,true);
select api.service_persist_fantasy_scoring_results('f6400000-0000-4000-8000-000000000001',current_setting('test.v')::bigint,current_setting('test.snap')::jsonb->>'inputDigest',pg_temp.selection_player_results(current_setting('test.snap')::jsonb),pg_temp.selection_team_results(current_setting('test.snap')::jsonb));
select api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',null,current_setting('test.v')::bigint);
select api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001',null,null,current_setting('test.v')::bigint);
update app_private.fantasy_publication_settings set first_gameweek=1 where season_id='f6300000-0000-4000-8000-000000000001';
select extensions.ok(exists(select 1 from app_private.fantasy_unpublished_gameweeks),'D: the journée is unpublished once the gate is on');
select set_config('request.jwt.claims','{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select extensions.is(api.get_my_fantasy_points(:'team'::uuid,'f6400000-0000-4000-8000-000000000001')->'result','null'::jsonb,'D: the manager read hides the points');
select extensions.is(api.fantasy_gameweek_summary('f6400000-0000-4000-8000-000000000001')->'highestPoints','null'::jsonb,'D: the summary hides the best score');
select extensions.is(jsonb_array_length(api.fantasy_overall_standings('f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',null,null,10)->'items'),0,'D: the held journée has no standings rows at all');
select extensions.is(api.fantasy_overall_standings('f6300000-0000-4000-8000-000000000001',null,null,null,10)->'items'->0->'totalPoints','0'::jsonb,'D: the season total does not include the held journée');
select extensions.is(api.fantasy_overall_standings('f6300000-0000-4000-8000-000000000001',null,null,null,10)->'items'->0->'gameweekPoints','null'::jsonb,'D: and its points column is empty');
-- The ranking writer runs again while the journée is held: it counts only published results, so
-- its new totals already leave the held journée out, and the shown total is still 0 (not negative).
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001',null,null,current_setting('test.v')::bigint);
select set_config('request.jwt.claims','{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select extensions.is(api.fantasy_overall_standings('f6300000-0000-4000-8000-000000000001',null,null,null,10)->'items'->0->'totalPoints','0'::jsonb,'D: after the writer runs again while held, the total is still 0');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
-- Tied teams while held: ranks follow the ranking writer's own tie-break (hits, confirmed transfers,
-- latest finalized score, creation date, id), never the old rank that includes the hidden journée.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('f8000000-0000-4000-8000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tie-b@example.test',statement_timestamp(),'hash','{}','{"username":"tie_b"}',statement_timestamp(),statement_timestamp()),
 ('f8000000-0000-4000-8000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tie-c@example.test',statement_timestamp(),'hash','{}','{"username":"tie_c"}',statement_timestamp(),statement_timestamp());
insert into app.fantasy_teams(id,user_id,fantasy_season_id,current_gameweek_id,name,bank,team_value,free_transfers)
values ('fa000000-0000-4000-8000-0000000000b1','f8000000-0000-4000-8000-0000000000b1','f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001','Tie B',10,90,1),
 ('fa000000-0000-4000-8000-0000000000c1','f8000000-0000-4000-8000-0000000000c1','f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001','Tie C',10,90,1);
update app.fantasy_rankings set rank=2,transfer_hits=0,confirmed_transfers=0,latest_finalized_gameweek_score=null,team_created_at='2026-01-01'
 where fantasy_team_id=current_setting('test.team')::uuid and gameweek_id is null and league_id is null;
insert into app.fantasy_rankings(fantasy_season_id,fantasy_team_id,rank,total_points,transfer_hits,confirmed_transfers,calculation_version,calculated_at,team_created_at)
select 'f6300000-0000-4000-8000-000000000001'::uuid,'fa000000-0000-4000-8000-0000000000b1'::uuid,1,0,4,0,1,statement_timestamp(),'2026-01-01'::timestamptz
union all select 'f6300000-0000-4000-8000-000000000001'::uuid,'fa000000-0000-4000-8000-0000000000c1'::uuid,3,0,0,2,1,statement_timestamp(),'2026-01-01'::timestamptz;
select extensions.is((select array_agg(fantasy_team_id::text order by rank) from app_private.fantasy_visible_rankings where gameweek_id is null and league_id is null),
 array[current_setting('test.team'),'fa000000-0000-4000-8000-0000000000c1','fa000000-0000-4000-8000-0000000000b1'],
 'tied shown totals are ordered by hits, then confirmed transfers: not by the old rank that holds the hidden journée');
select extensions.is((select array_agg(rank order by rank) from app_private.fantasy_visible_rankings where gameweek_id is null and league_id is null),array[1::bigint,2,3],'and the ranks are 1, 2, 3');
delete from app.fantasy_rankings where fantasy_team_id in ('fa000000-0000-4000-8000-0000000000b1','fa000000-0000-4000-8000-0000000000c1');
delete from app.fantasy_teams where id in ('fa000000-0000-4000-8000-0000000000b1','fa000000-0000-4000-8000-0000000000c1');
-- The rest of the writer's tie-break, level on hits and confirmed transfers: the latest finalized
-- score (higher first, none last), then the older team, then the lower id.
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('f8000000-0000-4000-8000-0000000000d' || i)::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tie-d' || i || '@example.test',statement_timestamp(),'hash','{}',('{"username":"tie_d' || i || '"}')::jsonb,statement_timestamp(),statement_timestamp()
from generate_series(1,4) i;
insert into app.fantasy_teams(id,user_id,fantasy_season_id,current_gameweek_id,name,bank,team_value,free_transfers)
select ('fa000000-0000-4000-8000-0000000000d' || i)::uuid,('f8000000-0000-4000-8000-0000000000d' || i)::uuid,'f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001','Tie D' || i,10,90,1
from generate_series(1,4) i;
-- d1: latest 9, created Jan 5. d2: latest 9, created Jan 3, id ...d2. d3: latest 9, created Jan 3, id ...d3. d4: no latest score.
insert into app.fantasy_rankings(fantasy_season_id,fantasy_team_id,rank,total_points,transfer_hits,confirmed_transfers,latest_finalized_gameweek_score,calculation_version,calculated_at,team_created_at)
select 'f6300000-0000-4000-8000-000000000001'::uuid,('fa000000-0000-4000-8000-0000000000d' || i)::uuid,10 - i,0,0,0,
  case when i = 4 then null else 9 end,1,statement_timestamp(),
  case i when 1 then '2026-01-05'::timestamptz when 4 then '2026-01-01'::timestamptz else '2026-01-03'::timestamptz end
from generate_series(1,4) i;
select extensions.is((select array_agg(fantasy_team_id::text order by rank) from app_private.fantasy_visible_rankings
   where gameweek_id is null and league_id is null and fantasy_team_id::text like 'fa000000-0000-4000-8000-0000000000d%'),
 array['fa000000-0000-4000-8000-0000000000d2','fa000000-0000-4000-8000-0000000000d3','fa000000-0000-4000-8000-0000000000d1','fa000000-0000-4000-8000-0000000000d4'],
 'level on hits and transfers: higher latest score first, then the older team, then the lower id, none last');
delete from app.fantasy_rankings where fantasy_team_id::text like 'fa000000-0000-4000-8000-0000000000d%';
delete from app.fantasy_teams where id::text like 'fa000000-0000-4000-8000-0000000000d%';
-- Results already written, but a rating is pending at the slot: never released.
select api.service_record_fantasy_api_ratings(pg_temp.fx(1),'9101',pg_temp.native_players(1,true),statement_timestamp());
select extensions.is(app_private.fantasy_publication_evaluate_at('f6400000-0000-4000-8000-000000000001',current_setting('test.slot')::timestamptz+interval '1 minute')->>'outcome','ratings_pending','D: written rows do not release a journée with a rating pending');
select extensions.ok(not exists(select 1 from app_private.fantasy_publication_state where gameweek_id='f6400000-0000-4000-8000-000000000001' and released_at is not null),'D: nothing was released');
delete from app_private.fantasy_publication_state where gameweek_id='f6400000-0000-4000-8000-000000000001';
select api.service_record_fantasy_api_ratings(pg_temp.fx(1),'9101',pg_temp.native_players(1,false),statement_timestamp());
select extensions.is(app_private.fantasy_publication_evaluate_at('f6400000-0000-4000-8000-000000000001',current_setting('test.slot')::timestamptz+interval '1 minute')->>'outcome','released','D: released at the slot');
select set_config('test.before_rows',(select (select count(*) from app.fantasy_team_gameweek_results where gameweek_id='f6400000-0000-4000-8000-000000000001')||'/'||(select count(*) from app.fantasy_player_point_events where gameweek_id='f6400000-0000-4000-8000-000000000001' and superseded_at is null)||'/'||(select count(*) from app.fantasy_rankings where gameweek_id='f6400000-0000-4000-8000-000000000001'))::text,true);
select set_config('test.v2',api.service_prepare_fantasy_live_scoring('f6400000-0000-4000-8000-000000000001')->>'calculationVersion',true);
select set_config('test.snap2',api.service_get_fantasy_scoring_snapshot('f6400000-0000-4000-8000-000000000001',current_setting('test.v2')::bigint,null,100)::text,true);
select api.service_persist_fantasy_scoring_results('f6400000-0000-4000-8000-000000000001',current_setting('test.v2')::bigint,current_setting('test.snap2')::jsonb->>'inputDigest',pg_temp.selection_player_results(current_setting('test.snap2')::jsonb),pg_temp.selection_team_results(current_setting('test.snap2')::jsonb));
select api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',null,current_setting('test.v2')::bigint);
select api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001',null,null,current_setting('test.v2')::bigint);
select extensions.is((select (select count(*) from app.fantasy_team_gameweek_results where gameweek_id='f6400000-0000-4000-8000-000000000001')||'/'||(select count(*) from app.fantasy_player_point_events where gameweek_id='f6400000-0000-4000-8000-000000000001' and superseded_at is null)||'/'||(select count(*) from app.fantasy_rankings where gameweek_id='f6400000-0000-4000-8000-000000000001')),current_setting('test.before_rows'),'D: the persist and rank at release leave no duplicate rows');
select set_config('request.jwt.claims','{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select extensions.ok((api.fantasy_overall_standings('f6300000-0000-4000-8000-000000000001',null,null,null,10)->'items'->0->>'totalPoints')::integer>0,'D: once released and published the total includes the journée');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select * from extensions.finish();
rollback;
