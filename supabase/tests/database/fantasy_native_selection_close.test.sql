-- Native selection progression, including normal and two-transfer Free Hit managers.
-- Staged SofaScore statistics: pull schedule, scoring layers, close on provisional points, re-scoring, lock (docs/backend/SOFASCORE_STAGED_STATS.md).
begin;

select extensions.no_plan();
select set_config('test.next_kickoff',(statement_timestamp()+interval '20 hours')::text,true);

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
    select id, row_number() over (order by id) as player_number from app.fantasy_players where fantasy_season_id='f6300000-0000-4000-8000-000000000001'
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
-- Different temporary captain choices must not replace the original selection.
update app.fantasy_lineup_players set captain=false,vice_captain=false where lineup_id in(select id from app.fantasy_lineups where fantasy_team_id=current_setting('test.free_hit_team')::uuid);
update app.fantasy_lineup_players set captain=(fantasy_player_id='f7000003-0000-4000-8000-000000000001'),vice_captain=(fantasy_player_id='f7000004-0000-4000-8000-000000000001') where lineup_id in(select id from app.fantasy_lineups where fantasy_team_id=current_setting('test.free_hit_team')::uuid);

-- ===========================================================================
-- Native selection close: normal and two-transfer Free Hit managers.
-- re-scoring, lock only when every match is FINAL or FINAL_LIMITED.
-- ===========================================================================
create function pg_temp.fx(i integer) returns uuid language sql immutable as $$
  select ('fa100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid $$;
create function pg_temp.club(i integer) returns uuid language sql immutable as $$
  select ('f4' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid $$;
create function pg_temp.fplayer(i integer) returns uuid language sql immutable as $$
  select ('f5' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid $$;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update app.fantasy_lineups set locked_at = statement_timestamp() where gameweek_id='f6400000-0000-4000-8000-000000000001';
update app.fantasy_gameweeks set status = 'provisional', deadline_at='2026-10-18T10:00Z',starts_at='2026-10-18T12:00Z',ends_at='2026-10-18T20:00Z' where id = 'f6400000-0000-4000-8000-000000000001';

insert into app.fixtures(id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status,
  home_score, away_score, provider_updated_at, source_sequence, source_version, finalized_at)
select pg_temp.fx(i), 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001', pg_temp.club(2 * i - 1), pg_temp.club(2 * i),
  '2026-10-18T12:00:00Z', 'finished', 0, 0, '2026-10-18T14:00:00Z', 10, 'staged-test-v1', '2026-10-18T14:00:00Z'
from generate_series(1, 8) i;
insert into app.fantasy_fixture_assignments(fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, frozen_at, source_version)
select 'f6300000-0000-4000-8000-000000000001', pg_temp.fx(i), 'f6400000-0000-4000-8000-000000000001',
  'f6400000-0000-4000-8000-000000000001', '2026-10-18T12:00:00Z', '2026-10-18T12:00:00Z', '2026-10-18T10:00:00Z', 1
from generate_series(1, 8) i;
insert into app_private.football_provider_mappings(provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
select 'sofascore', 'fixture', (9100 + i)::text, pg_temp.fx(i), 'test', now() from generate_series(1, 8) i;

-- The next gameweek, staged and complete (8 fixtures for the 16 clubs).
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
  pg_temp.club(i * 2 - 1), pg_temp.club(i * 2), current_setting('test.next_kickoff')::timestamptz, 'scheduled', '2089-12-01T12:00:00Z', 1, 'staged-test-v1'
from generate_series(1, 8) i;
insert into app.fantasy_fixture_assignments(fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, source_version)
select 'f6300000-0000-4000-8000-000000000001', id, 'f6400000-0000-4000-8000-000000000002',
  'f6400000-0000-4000-8000-000000000002', kickoff_at, kickoff_at, 1
from app.fixtures where round_id = 'f3000000-0000-4000-8000-000000000002';


insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at)
select 'sofascore','player',(100000+n)::text,pg_temp.fplayer(n),'selection-close-test',now()from generate_series(1,17)n;
insert into app_private.fantasy_api_rating_seasons(season_id,from_gameweek,owner_approval)
values('f6300000-0000-4000-8000-000000000001',1,'Test owner authorized native rating selection close');
insert into app_private.fantasy_live_scoring_policy(season_id,enabled)values('f6300000-0000-4000-8000-000000000001',true);
create function pg_temp.native_selection_players(i integer,missing boolean)returns jsonb language sql immutable as $$
 with entries as(select n,side,jsonb_build_object('externalId',case when n=1 then(100000+2*i-2+side)::text
   else(200000+i*100+side*20+n)::text end,'side',case when side=1 then 'home'else 'away'end,
   'starter',true,'appeared',true,'uncertain',false,'minutes',90,'rating',6.5)entry
   from generate_series(1,11)n cross join generate_series(1,2)side
 union all select 12,1,jsonb_build_object('externalId','100017','side','home','starter',false,
   'appeared',true,'uncertain',false,'minutes',4,'rating',case when missing then null::numeric else 7.5 end)where i=1)
 select jsonb_agg(entry order by side,n)from entries;
$$;
select api.service_record_fantasy_api_ratings(pg_temp.fx(i),(9100+i)::text,pg_temp.native_selection_players(i,true),statement_timestamp())from generate_series(1,8)i;
select extensions.ok(app_private.fantasy_selection_ratings_pending('f6400000-0000-4000-8000-000000000001'),'a real-shaped four-minute unrated appearance remains pending');
select extensions.ok(not app_private.fantasy_staged_enabled('f6400000-0000-4000-8000-000000000001'),'the legacy staged scoring policy remains disabled for native ratings');
select extensions.ok((api.service_fantasy_lifecycle_state('f6400000-0000-4000-8000-000000000001')->>'selectionCloseEnabled')::boolean,'native selection close capability is independently advertised');
create function pg_temp.selection_pending_seal_error()returns text language plpgsql as $$
declare v bigint;snapshot jsonb;begin
 v:=(api.service_prepare_fantasy_live_scoring('f6400000-0000-4000-8000-000000000001')->>'calculationVersion')::bigint;
 snapshot:=api.service_get_fantasy_scoring_snapshot('f6400000-0000-4000-8000-000000000001',v,null,100);
 perform api.service_begin_fantasy_finalization('f6400000-0000-4000-8000-000000000001',v,snapshot->>'inputDigest');
 raise exception 'unexpected_success';
exception when others then return sqlstate||':'||sqlerrm;
end $$;
select extensions.ok(pg_temp.selection_pending_seal_error()like 'PT409:%','missing actual ratings prevent finalization before administrative close');
select extensions.ok(not has_function_privilege('anon','api.service_begin_fantasy_selection_close(uuid,bigint)','execute'),'anonymous users cannot close a selection window');
select extensions.ok(not has_function_privilege('authenticated','api.service_begin_fantasy_selection_close(uuid,bigint)','execute'),'managers cannot invoke administrative close');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select extensions.throws_ok($$select api.service_begin_fantasy_selection_close('f6400000-0000-4000-8000-000000000001',1)$$,'PT403','forbidden','the service-only check also rejects forged caller scope');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select extensions.throws_ok($$select api.service_begin_fantasy_selection_close('f6400000-0000-4000-8000-000000000001',999)$$,'PT409','stale_update','a stale lock version cannot close a gameweek');
create function pg_temp.selection_close_error(variant text)returns text language plpgsql as $$
begin
 if variant='unfinished'then
  perform set_config('app.allow_fixture_correction','on',true);
  update app.fixtures set status='live_second_half',finalized_at=null,source_sequence=11 where id=pg_temp.fx(1);
 elsif variant='assignment'then
  update app.fantasy_fixture_assignments set frozen_at=null where fixture_id=pg_temp.fx(1);
 elsif variant='unlocked'then
  update app.fantasy_lineups set locked_at=null where fantasy_team_id=current_setting('test.normal_team')::uuid;
 end if;
 perform api.service_begin_fantasy_selection_close('f6400000-0000-4000-8000-000000000001',1);
 raise exception 'unexpected_success';
exception when others then return sqlstate||':'||sqlerrm;
end $$;
select extensions.is(pg_temp.selection_close_error('unfinished'),'PT409:fantasy_selection_matches_unfinished','one unended counted match refuses administrative close');
select extensions.is(pg_temp.selection_close_error('assignment'),'PT409:fantasy_selection_matches_unfinished','an unfrozen assignment cannot authorize progression');
select extensions.is(pg_temp.selection_close_error('unlocked'),'PT409:fantasy_selection_lineups_unlocked','an unlocked historical lineup refuses close');

select set_config('test.partial_version',api.service_prepare_fantasy_live_scoring('f6400000-0000-4000-8000-000000000001')->>'calculationVersion',true);
select api.service_get_fantasy_scoring_snapshot('f6400000-0000-4000-8000-000000000001',current_setting('test.partial_version')::bigint,null,100);
select set_config('test.selection_snapshots_before',(select count(*)::text from app_private.fantasy_scoring_snapshots where gameweek_id='f6400000-0000-4000-8000-000000000001'),true);
create temporary table historical_selection_before as select *from app.fantasy_lineup_players where lineup_id in(select id from app.fantasy_lineups where gameweek_id='f6400000-0000-4000-8000-000000000001');
select set_config('test.selection_input_version',(select scoring_input_version::text from app.fantasy_gameweeks where id='f6400000-0000-4000-8000-000000000001'),true);
select set_config('test.selection_close',api.service_begin_fantasy_selection_close('f6400000-0000-4000-8000-000000000001',1)::text,true);
select extensions.ok((current_setting('test.selection_close')::jsonb->>'ratingsPending')::boolean,'administrative close explicitly reports pending ratings');
select extensions.is((select close_kind from app_private.fantasy_gameweek_close where gameweek_id='f6400000-0000-4000-8000-000000000001'),'selection_only','the close receipt is distinctly administrative');
select extensions.is((select scoring_input_version::text from app.fantasy_gameweeks where id='f6400000-0000-4000-8000-000000000001'),current_setting('test.selection_input_version'),'no fake scoring version is introduced');
select extensions.is((select count(*)::integer from app_private.fantasy_scoring_snapshots where gameweek_id='f6400000-0000-4000-8000-000000000001'),current_setting('test.selection_snapshots_before')::integer,'administrative close does not synthesize a scoring snapshot');
select extensions.is((select count(*)::integer from app.fantasy_team_gameweek_results where gameweek_id='f6400000-0000-4000-8000-000000000001'),0,'administrative close does not publish zero or estimated scores');
select extensions.ok((api.service_begin_fantasy_selection_close('f6400000-0000-4000-8000-000000000001',1)->>'stableResult')::boolean,'replaying the original close request is stable');
select extensions.throws_ok($$select api.service_prepare_next_fantasy_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,1)$$,'PT409','fantasy_previous_postwork_incomplete','the successor cannot open before carry-over finishes');
select api.service_restore_free_hit('f6400000-0000-4000-8000-000000000001',1);
select api.service_roll_fantasy_free_transfers('f6400000-0000-4000-8000-000000000001',1);
select api.service_roll_fantasy_free_transfers('f6400000-0000-4000-8000-000000000001',1);
select extensions.throws_ok($$select api.service_complete_fantasy_close('f6400000-0000-4000-8000-000000000001',1)$$,'PT409','fantasy_prices_incomplete','an interrupted price pass keeps the successor closed');
select set_config('test.price_page',api.service_run_fantasy_close_price_batch('f6400000-0000-4000-8000-000000000001',1,null,5)::text,true);
select extensions.ok((current_setting('test.price_page')::jsonb->>'hasMore')::boolean,'price processing is genuinely paginated');
select extensions.ok((api.service_run_fantasy_close_price_batch('f6400000-0000-4000-8000-000000000001',1,null,5)->>'stableResult')::boolean,'the first price page can be replayed without moving prices twice');
do $$declare response jsonb:=current_setting('test.price_page')::jsonb;begin
 while(response->>'hasMore')::boolean loop response:=api.service_run_fantasy_close_price_batch('f6400000-0000-4000-8000-000000000001',1,(response->>'afterPlayerId')::uuid,5);end loop;
end $$;
select api.service_complete_fantasy_close('f6400000-0000-4000-8000-000000000001',1);
select set_config('test.first_prepare',api.service_prepare_next_fantasy_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,1)::text,true);
select extensions.ok((current_setting('test.first_prepare')::jsonb->>'hasMore')::boolean,'one-manager preparation does not prematurely open the successor');
select api.service_prepare_next_fantasy_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,1);
select extensions.is((select status::text from app.fantasy_gameweeks where id='f6400000-0000-4000-8000-000000000002'),'open','the successor opens while native rating evidence is still pending');
select extensions.is((select status::text from app.fantasy_gameweeks where id='f6400000-0000-4000-8000-000000000001'),'provisional','the original gameweek remains provisional');
select set_config('request.jwt.claims','{"sub":"f8000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select set_config('test.pending_owner_points',api.get_my_fantasy_points(current_setting('test.free_hit_team')::uuid,'f6400000-0000-4000-8000-000000000001')::text,true);
select extensions.is(current_setting('test.pending_owner_points')::jsonb->>'pointsState','provisional','the owner-facing points read remains explicitly provisional after the next window opens');
select extensions.ok(exists(select 1 from jsonb_array_elements(current_setting('test.pending_owner_points')::jsonb->'players')p
 where p->>'fantasyPlayerId'='f7000017-0000-4000-8000-000000000001'and p->>'ratingPending'='true'and p->'provisionalPoints'='null'::jsonb and p->'finalPoints'='null'::jsonb),'the actual unrated player remains pending with a blank points box in the owner API');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select extensions.is((select count(*)::integer from app.fantasy_squad_memberships where fantasy_team_id=current_setting('test.free_hit_team')::uuid and sold_at is null and fantasy_player_id in('f7000016-0000-4000-8000-000000000001','f7000017-0000-4000-8000-000000000001')),0,'both temporary Free Hit transfers are restored before the next window opens');
select extensions.ok(not exists(select 1 from historical_selection_before b left join app.fantasy_lineup_players a on a.lineup_id=b.lineup_id and a.fantasy_player_id=b.fantasy_player_id where to_jsonb(a)is distinct from to_jsonb(b)),'locked historical selections are byte-for-byte preserved');
select extensions.ok(pg_temp.selection_pending_seal_error()like 'PT409:%','opening the successor does not weaken the real-rating scoring guard');
select extensions.is((select count(*)::integer from app_private.notification_events where event_type='gameweek_finalized'and source_entity_id='f6400000-0000-4000-8000-000000000001'),0,'no points-ready event is invented at administrative close');
-- A real successor transfer must survive a later finalization of the old round.
select set_config('test.next_trade_version',(select version::text from app.fantasy_teams where id=current_setting('test.normal_team')::uuid),true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select api.confirm_fantasy_transfers(current_setting('test.normal_team')::uuid,'f6400000-0000-4000-8000-000000000002',
 '[{"player_out_id":"f7000014-0000-4000-8000-000000000001","player_in_id":"f7000017-0000-4000-8000-000000000001"}]',
 current_setting('test.next_trade_version')::bigint,'fa000000-0000-4000-8000-000000000006',null);
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create temporary table economics_before as select 'teams'kind,to_jsonb(t)row from app.fantasy_teams t where fantasy_season_id='f6300000-0000-4000-8000-000000000001'
 union all select 'memberships',to_jsonb(m)from app.fantasy_squad_memberships m where fantasy_team_id in(select id from app.fantasy_teams where fantasy_season_id='f6300000-0000-4000-8000-000000000001')
 union all select 'prices',to_jsonb(p)from app.fantasy_players p where fantasy_season_id='f6300000-0000-4000-8000-000000000001';
select api.service_restore_free_hit('f6400000-0000-4000-8000-000000000001',1);
select api.service_roll_fantasy_free_transfers('f6400000-0000-4000-8000-000000000001',1);
select api.service_prepare_next_fantasy_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,1);
select api.service_record_fantasy_api_ratings(pg_temp.fx(1),'9101',pg_temp.native_selection_players(1,false),statement_timestamp());
select extensions.ok(not app_private.fantasy_selection_ratings_pending('f6400000-0000-4000-8000-000000000001'),'a later real rating makes normal scoring eligible');
select extensions.lives_ok($$select api.service_prepare_fantasy_live_scoring('f6400000-0000-4000-8000-000000000001')$$,'the existing scoring preparation accepts the actual rating after carry-over');
select set_config('test.final_version',api.service_prepare_fantasy_live_scoring('f6400000-0000-4000-8000-000000000001')->>'calculationVersion',true);
select set_config('test.final_snapshot',api.service_get_fantasy_scoring_snapshot('f6400000-0000-4000-8000-000000000001',current_setting('test.final_version')::bigint,null,100)::text,true);
-- Independent arithmetic oracle: each actual rating rounds half up; all these
-- confirmed participants played. No missing rating is given a score.
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
select api.service_persist_fantasy_scoring_results('f6400000-0000-4000-8000-000000000001',current_setting('test.final_version')::bigint,
 current_setting('test.final_snapshot')::jsonb->>'inputDigest',pg_temp.selection_player_results(current_setting('test.final_snapshot')::jsonb),
 pg_temp.selection_team_results(current_setting('test.final_snapshot')::jsonb));
select api.service_begin_fantasy_finalization('f6400000-0000-4000-8000-000000000001',current_setting('test.final_version')::bigint,current_setting('test.final_snapshot')::jsonb->>'inputDigest');
select api.service_finalize_fantasy_team_results('f6400000-0000-4000-8000-000000000001',current_setting('test.final_version')::bigint,null,100);
select api.service_restore_free_hit('f6400000-0000-4000-8000-000000000001',100);
select api.service_roll_fantasy_free_transfers('f6400000-0000-4000-8000-000000000001',100);
select api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',null,current_setting('test.final_version')::bigint);
select api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001',null,null,current_setting('test.final_version')::bigint);
select api.service_complete_fantasy_gameweek('f6400000-0000-4000-8000-000000000001',current_setting('test.final_version')::bigint);
select api.service_adopt_fantasy_close_prices('f6400000-0000-4000-8000-000000000001',current_setting('test.final_version')::bigint);
select api.service_enqueue_gameweek_finalized_notifications('f6400000-0000-4000-8000-000000000001',current_setting('test.final_version')::bigint,null,100);
select api.service_enqueue_gameweek_finalized_notifications('f6400000-0000-4000-8000-000000000001',current_setting('test.final_version')::bigint,null,100);
select api.service_complete_fantasy_postwork('f6400000-0000-4000-8000-000000000001',current_setting('test.final_version')::bigint);
select extensions.is((select final_score from app.fantasy_team_gameweek_results where gameweek_id='f6400000-0000-4000-8000-000000000001'and fantasy_team_id=current_setting('test.normal_team')::uuid),84,'eleven rounded ratings plus the actual captain finalize at 84 despite the later successor transfer');
select extensions.is((select final_score from app.fantasy_team_gameweek_results where gameweek_id='f6400000-0000-4000-8000-000000000001'and fantasy_team_id=current_setting('test.free_hit_team')::uuid),85,'the temporary historical Free Hit player keeps the actual late rating in the old score');
select extensions.is((select count(*)::integer from app_private.notification_events where event_type='gameweek_finalized'and source_entity_id='f6400000-0000-4000-8000-000000000001'),2,'finalized notifications are deduplicated once per manager after actual scoring');
select extensions.ok(exists(select 1 from app_private.fantasy_gameweek_postwork where gameweek_id='f6400000-0000-4000-8000-000000000001'and price_last_response->>'adoptedFromClose'='true'),'final postwork adopts the administrative price receipt');
select extensions.ok(not exists((select *from economics_before)except(select 'teams',to_jsonb(t)from app.fantasy_teams t where fantasy_season_id='f6300000-0000-4000-8000-000000000001'
 union all select 'memberships',to_jsonb(m)from app.fantasy_squad_memberships m where fantasy_team_id in(select id from app.fantasy_teams where fantasy_season_id='f6300000-0000-4000-8000-000000000001')
 union all select 'prices',to_jsonb(p)from app.fantasy_players p where fantasy_season_id='f6300000-0000-4000-8000-000000000001')),'late ratings and replayed carry-over leave successor economics unchanged');
-- A scheduled successor must not consume its manager reminder; opening inside
-- the 24-hour window still creates exactly one actionable deadline event.
savepoint reminder;
update app_private.notification_email_settings set manager_automation_enabled=false where id;
update app.fantasy_gameweeks set status='scheduled'where id='f6400000-0000-4000-8000-000000000002';
select app_private.notification_email_plan((select deadline_at-interval'17 hours'from app.fantasy_gameweeks where id='f6400000-0000-4000-8000-000000000002'));
select extensions.is((select count(*)::integer from app_private.notification_events where event_type='deadline_24h'and source_entity_id='f6400000-0000-4000-8000-000000000002'),0,'disabled manager automation cannot consume a scheduled successor reminder key');
update app_private.notification_email_settings set manager_automation_enabled=true where id;
update app.fantasy_gameweeks set status='scheduled'where id='f6400000-0000-4000-8000-000000000002';
select app_private.notification_email_plan((select deadline_at-interval'17 hours'from app.fantasy_gameweeks where id='f6400000-0000-4000-8000-000000000002'));
select extensions.is((select count(*)::integer from app_private.notification_events where event_type='deadline_24h'and source_entity_id='f6400000-0000-4000-8000-000000000002'),0,'scheduled manager windows do not consume deadline deduplication keys');
update app.fantasy_gameweeks set status='open'where id='f6400000-0000-4000-8000-000000000002';
select app_private.notification_email_plan((select deadline_at-interval'17 hours'from app.fantasy_gameweeks where id='f6400000-0000-4000-8000-000000000002'));
select app_private.notification_email_plan((select deadline_at-interval'16 hours'from app.fantasy_gameweeks where id='f6400000-0000-4000-8000-000000000002'));
select extensions.is((select count(*)::integer from app_private.notification_events where event_type='deadline_24h'and source_entity_id='f6400000-0000-4000-8000-000000000002'),1,'a window opened late gets one actionable reminder rather than a permanently cancelled event');

select *from extensions.finish(true);
rollback;
