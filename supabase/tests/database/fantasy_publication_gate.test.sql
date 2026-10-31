-- Publish a journée's points all at once (20261030100000), the moved-match
-- close (20261030100100), the 24 h 30 min rating poll mark (20261030100200)
-- and the watchdog (20261030100300).
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

-- ===========================================================================
-- 1. The rule, as arithmetic
-- ===========================================================================
-- Gates: the default first gated journée is 6, so journée 1 is not gated;
-- the season setting moves it.
select extensions.is(app_private.fantasy_publication_first_gameweek('f6300000-0000-4000-8000-000000000001'),6,
  'a season without a setting publishes all at once from journée 6');
select extensions.ok(not app_private.fantasy_publication_gated('f6400000-0000-4000-8000-000000000001'),
  'journée 1 (and so 2 to 5) is not gated by default');
select extensions.is(app_private.fantasy_publication_state_json('f6400000-0000-4000-8000-000000000001'),'{}'::jsonb,
  'an ungated journée reports nothing to the worker');
select extensions.is(app_private.fantasy_publication_evaluate_at('f6400000-0000-4000-8000-000000000001',now())->>'released','true',
  'an ungated journée is always released');
select extensions.is((select count(*)::integer from app_private.fantasy_unpublished_gameweeks),0,'no journée is unpublished while none is gated');
insert into app_private.fantasy_publication_settings(season_id,first_gameweek) values ('f6300000-0000-4000-8000-000000000001',2);
select extensions.ok(not app_private.fantasy_publication_gated('f6400000-0000-4000-8000-000000000001'),'journée 1 stays ungated when the season starts at 2');
select extensions.ok(app_private.fantasy_publication_gated('f6400000-0000-4000-8000-000000000002'),'journée 2 is gated when the season starts at 2');
update app_private.fantasy_publication_settings set first_gameweek=1 where season_id='f6300000-0000-4000-8000-000000000001';
select extensions.ok(app_private.fantasy_publication_gated('f6400000-0000-4000-8000-000000000001'),'journée 1 is gated once the season setting is 1');

-- The slot: two Moroccan days after the last match, at 14:00 Moroccan time.
select extensions.is(app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000001'),current_setting('test.slot')::timestamptz,
  'last match D0 evening gives D0 + 2 days at 14:00 Moroccan time');
select extensions.is(app_private.fantasy_publication_next_slot(pg_temp.ma('2026-10-31 13:59')),pg_temp.ma('2026-10-31 14:00'),
  'before 14:00 Moroccan time the next slot is today 14:00');
select extensions.is(app_private.fantasy_publication_next_slot(pg_temp.ma('2026-10-31 14:00')),pg_temp.ma('2026-11-01 14:00'),
  'at 14:00 exactly the next slot is tomorrow');
select extensions.is(app_private.fantasy_publication_next_slot(pg_temp.ma('2026-10-31 23:30')),pg_temp.ma('2026-11-01 14:00'),
  'late in the evening the next slot is the next afternoon');
-- The worked example: last match Thursday evening, published Saturday 14:00.
-- It uses a Thursday far in the future (29 October 2099) so the fixed time stays
-- after the kickoff, which is yesterday: fixtures_finalized_at_check refuses a
-- final whistle before the kickoff, and the 2026 dates fell behind it on 2026-10-31.
select set_config('app.allow_fixture_correction','on',true);
update app.fixtures set finalized_at=pg_temp.ma('2099-10-29 22:00'),source_sequence=11 where id in (select pg_temp.fx(i) from generate_series(1,8) i);
select extensions.is(app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000001'),pg_temp.ma('2099-10-31 14:00'),
  'Thursday 22:00 Moroccan time gives Saturday 14:00 Moroccan time');
select extensions.is(app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000001'),'2099-10-31 14:00:00+00'::timestamptz,
  'Morocco keeps UTC+0 from 2026-09-20, so Saturday 14:00 Moroccan time is 14:00 UTC, whatever zone data the database carries');
update app.fixtures set finalized_at=pg_temp.ma('2099-10-30 00:30'),source_sequence=12 where id=pg_temp.fx(8);
select extensions.is(app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000001'),pg_temp.ma('2099-11-01 14:00'),
  'a match ending at 00:30 Moroccan time on Friday counts as Friday: Sunday 14:00');
update app.fixtures set finalized_at=current_setting('test.final')::timestamptz,source_sequence=13 where id in (select pg_temp.fx(i) from generate_series(1,8) i);
-- Null until every counted match is finished.
update app.fixtures set status='live_second_half',finalized_at=null,source_sequence=14 where id=pg_temp.fx(3);
select extensions.is(app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000001'),null::timestamptz,'no time while a counted match is unfinished');
update app.fixtures set status='finished',finalized_at=current_setting('test.final')::timestamptz,source_sequence=15 where id=pg_temp.fx(3);
select set_config('app.allow_fixture_correction','off',true);
select extensions.is(app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000001'),current_setting('test.slot')::timestamptz,'the time is back once the match ends');

-- ===========================================================================
-- 2. Before the slot: nothing is written, nothing is shown
-- ===========================================================================
select extensions.is(api.service_fantasy_lifecycle_state('f6400000-0000-4000-8000-000000000001')->>'publicationHeld','true',
  'the lifecycle state says the journée is held');
select extensions.is(api.service_fantasy_lifecycle_state('f6400000-0000-4000-8000-000000000001')->>'publishAt',
  to_char(current_setting('test.slot')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS')||'+00:00',
  'the lifecycle state carries the publication moment');
select extensions.ok(exists(select 1 from app_private.fantasy_unpublished_gameweeks where gameweek_id='f6400000-0000-4000-8000-000000000001'),
  'the journée counts as unpublished');
select extensions.is(app_private.fantasy_publication_evaluate_at('f6400000-0000-4000-8000-000000000001',current_setting('test.slot')::timestamptz-interval '1 minute')->>'outcome',
  'before_publish_time','one minute before the slot the journée is held');
create function pg_temp.held_error(call text)returns text language plpgsql as $$
begin execute call;return 'no error';
exception when others then return sqlstate||':'||sqlerrm;end $$;
select extensions.is(pg_temp.held_error($$select api.service_prepare_fantasy_live_scoring('f6400000-0000-4000-8000-000000000001')$$),
  'PT409:fantasy_publication_held','preparing live points is refused before the slot');
select extensions.is(pg_temp.held_error($$select api.service_persist_fantasy_scoring_results('f6400000-0000-4000-8000-000000000001',1,repeat('a',64),'[]','[]')$$),
  'PT409:fantasy_publication_held','writing points is refused before the slot');
select extensions.is(pg_temp.held_error($$select api.service_begin_fantasy_finalization('f6400000-0000-4000-8000-000000000001',1,repeat('a',64))$$),
  'PT409:fantasy_publication_held','finalizing is refused before the slot');
select extensions.is(pg_temp.held_error($$select api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',null,1)$$),
  'PT409:fantasy_publication_held','publishing the journée ranking is refused before the slot');
select extensions.is((select count(*)::integer from app.fantasy_team_gameweek_results where gameweek_id='f6400000-0000-4000-8000-000000000001')
  +(select count(*)::integer from app.fantasy_player_gameweek_points where gameweek_id='f6400000-0000-4000-8000-000000000001')
  +(select count(*)::integer from app.fantasy_rankings where gameweek_id='f6400000-0000-4000-8000-000000000001'),0,
  'nothing was written for the journée');
select extensions.ok(not has_function_privilege('anon','api.service_evaluate_fantasy_publication(uuid)','execute')
  and not has_function_privilege('authenticated','api.service_evaluate_fantasy_publication(uuid)','execute')
  and has_function_privilege('service_role','api.service_evaluate_fantasy_publication(uuid)','execute'),
  'only the service role can decide a publication');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select extensions.throws_ok($$select api.service_evaluate_fantasy_publication('f6400000-0000-4000-8000-000000000001')$$,'PT403','forbidden','a forged caller scope cannot decide a publication');
select set_config('request.jwt.claims','{"role":"service_role"}',true);

-- The fan reader: a manager sees no points for the waiting journée and is told when.
select set_config('request.jwt.claims','{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.held_points',api.get_my_fantasy_points(current_setting('test.team')::uuid,'f6400000-0000-4000-8000-000000000001')::text,true);
select extensions.is(current_setting('test.held_points')::jsonb->>'publicationHeld','true','the manager read says the journée is held');
select extensions.is(current_setting('test.held_points')::jsonb->'result','null'::jsonb,'the manager read has no result');
select extensions.ok(not exists(select 1 from jsonb_array_elements(current_setting('test.held_points')::jsonb->'players')p
  where p->>'ratingPending'='true' or p->'provisionalPoints'<>'null'::jsonb),'no player shows points or rating progress');
select extensions.is(api.fantasy_gameweek_summary('f6400000-0000-4000-8000-000000000001')->>'publicationHeld','true','the journée summary says it is held');
select extensions.is(api.fantasy_gameweek_summary('f6400000-0000-4000-8000-000000000001')->'highestPoints','null'::jsonb,'the summary shows no best score');
select extensions.is((select i->>'publicationHeld' from jsonb_array_elements(api.fantasy_gameweeks('f6300000-0000-4000-8000-000000000001')->'items') i where (i->>'sequence')::integer=1),
  'true','the gameweek list marks the journée as held');
select extensions.is((select (i->>'publishAt')::timestamptz from jsonb_array_elements(api.fantasy_gameweeks('f6300000-0000-4000-8000-000000000001')->'items') i where (i->>'sequence')::integer=1),
  current_setting('test.slot')::timestamptz,'the gameweek list carries the slot');
select extensions.is((select i->>'publicationHeld' from jsonb_array_elements(api.fantasy_gameweeks('f6300000-0000-4000-8000-000000000001')->'items') i where (i->>'sequence')::integer=2),
  'true','a scheduled gated journée is held too, with no moment known yet');
select extensions.is((select i->'publishAt' from jsonb_array_elements(api.fantasy_gameweeks('f6300000-0000-4000-8000-000000000001')->'items') i where (i->>'sequence')::integer=2),
  'null'::jsonb,'and its moment is unknown until its matches end');
select set_config('request.jwt.claims','{"role":"service_role"}',true);

-- ===========================================================================
-- 3. The selection close and the next journée's opening do not wait
-- ===========================================================================
select extensions.ok((api.service_fantasy_lifecycle_state('f6400000-0000-4000-8000-000000000001')->>'selectionCloseEnabled')::boolean,
  'the selection close stays available while the journée is held');
select set_config('test.close',api.service_begin_fantasy_selection_close('f6400000-0000-4000-8000-000000000001',1)::text,true);
select extensions.ok((current_setting('test.close')::jsonb->>'closed')::boolean and (current_setting('test.close')::jsonb->>'ratingsPending')::boolean,
  'the journée closes for selection while held, ratings pending');
select api.service_restore_free_hit('f6400000-0000-4000-8000-000000000001',1);
select api.service_roll_fantasy_free_transfers('f6400000-0000-4000-8000-000000000001',1);
do $$declare response jsonb:='{"hasMore":true}'::jsonb;begin
 response:=api.service_run_fantasy_close_price_batch('f6400000-0000-4000-8000-000000000001',1,null,5);
 while(response->>'hasMore')::boolean loop response:=api.service_run_fantasy_close_price_batch('f6400000-0000-4000-8000-000000000001',1,(response->>'afterPlayerId')::uuid,5);end loop;
end $$;
select api.service_complete_fantasy_close('f6400000-0000-4000-8000-000000000001',1);
select api.service_prepare_next_fantasy_gameweek('f6400000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000002',1,100);
select extensions.is((select status::text from app.fantasy_gameweeks where id='f6400000-0000-4000-8000-000000000002'),'open','the next journée opens while the journée is held');
select extensions.is((select status::text from app.fantasy_gameweeks where id='f6400000-0000-4000-8000-000000000001'),'provisional','and the held journée stays provisional');
select extensions.ok(exists(select 1 from app_private.fantasy_unpublished_gameweeks where gameweek_id='f6400000-0000-4000-8000-000000000001'),
  'and is still unpublished');

-- ===========================================================================
-- 4. At the slot with a rating still pending: the whole journée waits a day
-- ===========================================================================
select set_config('test.slot_json',app_private.fantasy_publication_evaluate_at('f6400000-0000-4000-8000-000000000001',current_setting('test.slot')::timestamptz)::text,true);
select extensions.is(current_setting('test.slot_json')::jsonb->>'outcome','ratings_pending','at the slot a pending rating holds the journée');
select extensions.is((current_setting('test.slot_json')::jsonb->>'publishAt')::timestamptz,
  app_private.fantasy_publication_next_slot(current_setting('test.slot')::timestamptz),'and moves it to the next 14:00 Moroccan time');
select extensions.is(app_private.fantasy_publication_next_slot(current_setting('test.slot')::timestamptz),current_setting('test.slot')::timestamptz+interval '1 day',
  'which is exactly one day later');
select extensions.is(api.service_fantasy_lifecycle_state('f6400000-0000-4000-8000-000000000001')->>'publicationHeld','true','still held');
select extensions.is(pg_temp.held_error($$select api.service_persist_fantasy_scoring_results('f6400000-0000-4000-8000-000000000001',1,repeat('a',64),'[]','[]')$$),
  'PT409:fantasy_publication_held','still no points at the slot');
-- The last rating arrives five minutes after the slot: still not published until the next slot.
select api.service_record_fantasy_api_ratings(pg_temp.fx(1),'9101',pg_temp.native_players(1,false),statement_timestamp());
select extensions.ok(not app_private.fantasy_selection_ratings_pending('f6400000-0000-4000-8000-000000000001'),'every rating is now in');
select extensions.is(app_private.fantasy_publication_evaluate_at('f6400000-0000-4000-8000-000000000001',current_setting('test.slot')::timestamptz+interval '5 minutes')->>'outcome',
  'before_publish_time','five minutes after the slot the journée still waits for the next one');
select extensions.is(app_private.fantasy_publication_evaluate_at('f6400000-0000-4000-8000-000000000001',current_setting('test.slot')::timestamptz+interval '23 hours 59 minutes')->>'outcome',
  'before_publish_time','and a minute before the next slot');
select extensions.is(app_private.fantasy_publication_slot('f6400000-0000-4000-8000-000000000001'),current_setting('test.slot')::timestamptz+interval '1 day',
  'the fans are told the next slot');

-- Health, before any alarm: the three checks are information only for this journée.
select extensions.ok((select c->>'status' from jsonb_array_elements(app_private.ops_health_checks()->'checks')c where c->>'name'='fantasy_fixture_coverage')<>'fail',
  'coverage does not fail for a held journée before its slot');
select extensions.ok((select c->>'status' from jsonb_array_elements(app_private.ops_health_checks()->'checks')c where c->>'name'='fantasy_scoring')<>'fail',
  'scoring does not fail for a held journée before its slot');
select extensions.ok((select c->>'status' from jsonb_array_elements(app_private.ops_health_checks()->'checks')c where c->>'name'='fantasy_progression')<>'fail',
  'progression does not fail for a held journée before its slot');
select extensions.is((select count(*)::integer from jsonb_array_elements(app_private.ops_health_checks()->'fantasyPublication')i where (i->>'sequence')::integer=1),1,
  'the held journée is listed as information');
select extensions.is((select i->>'alarm' from jsonb_array_elements(app_private.ops_health_checks()->'fantasyPublication')i where (i->>'sequence')::integer=1),null,'with no alarm');

-- ===========================================================================
-- 5. The next slot, all ratings in: one pass publishes, ranks and finalizes
-- ===========================================================================
select extensions.is(app_private.fantasy_publication_evaluate_at('f6400000-0000-4000-8000-000000000001',current_setting('test.slot')::timestamptz+interval '1 day')->>'outcome',
  'released','at the next slot with every rating in the journée is released');
select extensions.is(api.service_fantasy_lifecycle_state('f6400000-0000-4000-8000-000000000001')->>'publicationReleased','true','the state says released');
select extensions.is(app_private.fantasy_publication_evaluate_at('f6400000-0000-4000-8000-000000000001',current_setting('test.slot')::timestamptz+interval '2 days')->>'outcome',
  'released','a released journée stays released');
select extensions.ok(exists(select 1 from app_private.fantasy_unpublished_gameweeks where gameweek_id='f6400000-0000-4000-8000-000000000001'),
  'but fans still see nothing until the ranking exists (no half publication)');
select set_config('test.final_version',api.service_prepare_fantasy_live_scoring('f6400000-0000-4000-8000-000000000001')->>'calculationVersion',true);
select set_config('test.final_snapshot',api.service_get_fantasy_scoring_snapshot('f6400000-0000-4000-8000-000000000001',current_setting('test.final_version')::bigint,null,100)::text,true);
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
select extensions.is((select count(*)::integer from app.fantasy_team_gameweek_results where gameweek_id='f6400000-0000-4000-8000-000000000001'),1,'after release the points are written');
select extensions.ok(exists(select 1 from app_private.fantasy_unpublished_gameweeks where gameweek_id='f6400000-0000-4000-8000-000000000001'),
  'and still hidden from fans until the ranking is published');
select extensions.is((select count(*)::integer from app_private.fantasy_visible_team_results where gameweek_id='f6400000-0000-4000-8000-000000000001'),0,
  'the fan view of team results is empty at that point');
select api.service_begin_fantasy_finalization('f6400000-0000-4000-8000-000000000001',current_setting('test.final_version')::bigint,current_setting('test.final_snapshot')::jsonb->>'inputDigest');
select api.service_finalize_fantasy_team_results('f6400000-0000-4000-8000-000000000001',current_setting('test.final_version')::bigint,null,100);
select api.service_restore_free_hit('f6400000-0000-4000-8000-000000000001',100);
select api.service_roll_fantasy_free_transfers('f6400000-0000-4000-8000-000000000001',100);
select api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001',null,current_setting('test.final_version')::bigint);
select api.service_recalculate_fantasy_rankings('f6300000-0000-4000-8000-000000000001',null,null,current_setting('test.final_version')::bigint);
select extensions.ok(not exists(select 1 from app_private.fantasy_unpublished_gameweeks where gameweek_id='f6400000-0000-4000-8000-000000000001'),
  'once ranked, the journée is published to fans');
select extensions.is((select count(*)::integer from app_private.fantasy_visible_team_results where gameweek_id='f6400000-0000-4000-8000-000000000001'),1,
  'the fan view now shows the whole journée');
select api.service_complete_fantasy_gameweek('f6400000-0000-4000-8000-000000000001',current_setting('test.final_version')::bigint);
select extensions.is((select status::text from app.fantasy_gameweeks where id='f6400000-0000-4000-8000-000000000001'),'finalized','the journée finalizes in the same pass');
select set_config('request.jwt.claims','{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select extensions.ok(api.get_my_fantasy_points(current_setting('test.team')::uuid,'f6400000-0000-4000-8000-000000000001')->>'publicationHeld' is null,
  'the manager read no longer says held');
select extensions.ok(api.get_my_fantasy_points(current_setting('test.team')::uuid,'f6400000-0000-4000-8000-000000000001')->'result'<>'null'::jsonb,
  'and shows the result');
select set_config('request.jwt.claims','{"role":"service_role"}',true);

-- ===========================================================================
-- 6. A gated journée that is ready releases at its first slot, and the alarms
-- ===========================================================================
-- (a second gated journée: journée 2, which opened above)
update app.fantasy_gameweeks set status='provisional' where id='f6400000-0000-4000-8000-000000000002';
create temporary table alarm_probe as select 'f6400000-0000-4000-8000-000000000002'::uuid as id;
-- Its matches end 2 days ago in the evening; its slot is yesterday 14:00.
set local session_replication_role = replica;
update app.fixtures set status='finished',home_score=0,away_score=0,
  kickoff_at=current_setting('test.kickoff')::timestamptz-interval '2 days',
  finalized_at=current_setting('test.final')::timestamptz-interval '2 days'
  where round_id='f3000000-0000-4000-8000-000000000002';
update app.fantasy_fixture_assignments set assigned_kickoff_at=current_setting('test.kickoff')::timestamptz-interval '2 days',
  original_kickoff_at=current_setting('test.kickoff')::timestamptz-interval '2 days'
  where gameweek_id='f6400000-0000-4000-8000-000000000002';
set local session_replication_role = origin;
select extensions.ok(app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000002')<now(),'journée 2 slot has passed');
select extensions.is(app_private.fantasy_publication_alarm_at('f6400000-0000-4000-8000-000000000002',app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000002')+interval '29 minutes'),
  null,'no alarm 29 minutes after the slot');
select extensions.is(app_private.fantasy_publication_alarm_at('f6400000-0000-4000-8000-000000000002',app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000002')+interval '31 minutes'),
  null,'no alarm 31 minutes after the slot while its ratings are missing');
select extensions.is(app_private.fantasy_publication_alarm_at('f6400000-0000-4000-8000-000000000002',app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000002')+interval '7 days 1 minute'),
  'ratings_missing_7_days','7 days after the first slot with ratings missing the owner must decide');
select extensions.is(app_private.fantasy_publication_alarm_at('f6400000-0000-4000-8000-000000000002',app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000002')+interval '6 days 23 hours'),
  null,'but not before');
select extensions.is(app_private.fantasy_publication_alarm_at('f6400000-0000-4000-8000-000000000001',now()),null,'a published journée never alarms');

-- The three checks fail only on the alarm: first the 7 day case, via the first slot recorded 8 days ago.
insert into app_private.fantasy_publication_state(gameweek_id,first_slot_at) values ('f6400000-0000-4000-8000-000000000002',now()-interval '8 days')
  on conflict (gameweek_id) do update set first_slot_at=excluded.first_slot_at;
select extensions.is(app_private.fantasy_publication_alarm_at('f6400000-0000-4000-8000-000000000002',now()),'ratings_missing_7_days','the alarm is live');
select extensions.is((select array_agg(c->>'name' order by c->>'name') from jsonb_array_elements(app_private.ops_health_checks()->'checks')c
  where c->>'status'='fail' and c->>'name' in ('fantasy_fixture_coverage','fantasy_scoring','fantasy_progression')),
  array['fantasy_fixture_coverage','fantasy_progression','fantasy_scoring'],'then the three checks fail');
select extensions.ok((select c->>'detail' from jsonb_array_elements(app_private.ops_health_checks()->'checks')c where c->>'name'='fantasy_scoring')
  like '%Journée 2 is still unpublished 7 days%owner must decide%','and say which journée and what to do');
select extensions.is(app_private.ops_health_checks()->>'status','fail','and the whole answer fails');
update app_private.fantasy_publication_state set first_slot_at=app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000002')
  where gameweek_id='f6400000-0000-4000-8000-000000000002';
select extensions.ok(not exists(select 1 from jsonb_array_elements(app_private.ops_health_checks()->'checks')c
  where c->>'status'='fail' and c->>'name' in ('fantasy_fixture_coverage','fantasy_scoring','fantasy_progression')),
  'with the alarm gone they do not fail for it');
-- Ratings ready, slot passed more than 30 minutes ago, not released: the worker did not run.
insert into app_private.football_provider_mappings(provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
select 'sofascore', 'fixture', (9200 + i)::text, ('fb000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'test', now() from generate_series(1, 8) i;
select api.service_record_fantasy_api_ratings(('fb000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,(9200+i)::text,
  pg_temp.native_players(i,false),app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000002')+interval '3 hours')from generate_series(1,8)i;
select extensions.ok(not app_private.fantasy_selection_ratings_pending('f6400000-0000-4000-8000-000000000002'),'journée 2 ratings are all in');
select extensions.is(app_private.fantasy_publication_alarm_at('f6400000-0000-4000-8000-000000000002',app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000002')+interval '29 minutes'),
  null,'no alarm 29 minutes after the slot, all ratings in');
select extensions.is(app_private.fantasy_publication_alarm_at('f6400000-0000-4000-8000-000000000002',app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000002')+interval '31 minutes'),
  'unpublished_after_slot','31 minutes after the slot with all ratings in and nothing published: alarm');
select extensions.is((select array_agg(c->>'name' order by c->>'name') from jsonb_array_elements(app_private.ops_health_checks()->'checks')c
  where c->>'status'='fail' and c->>'name' in ('fantasy_fixture_coverage','fantasy_scoring','fantasy_progression')),
  array['fantasy_fixture_coverage','fantasy_progression','fantasy_scoring'],'the three checks fail when the worker did not release a ready journée');
select extensions.ok((select c->>'detail' from jsonb_array_elements(app_private.ops_health_checks()->'checks')c where c->>'name'='fantasy_fixture_coverage')
  like '%Journée 2 is still unpublished more than 30 minutes after its publication time%','and name the journée');
-- The worker's decision clears it.
-- The ratings arrived three hours AFTER the slot: a worker that looks only now, or four hours after the
-- slot, must not release at that moment, it waits for the next slot (the decision belongs to the slot).
select extensions.is(app_private.fantasy_publication_evaluate_at('f6400000-0000-4000-8000-000000000002',app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000002')+interval '4 hours')->>'outcome','ratings_pending','ratings that arrived after the slot do not release at the late look');
select extensions.is(app_private.fantasy_publication_slot('f6400000-0000-4000-8000-000000000002'),app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000002')+interval '1 day','and the journée waits for the next slot');
select extensions.is(app_private.fantasy_publication_evaluate_at('f6400000-0000-4000-8000-000000000002',app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000002')+interval '1 day'-interval '1 minute')->>'outcome','before_publish_time','a minute before it still waits');
select extensions.is(app_private.fantasy_publication_evaluate_at('f6400000-0000-4000-8000-000000000002',app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000002')+interval '1 day'+interval '1 minute')->>'outcome','released','at the next slot, ratings in since before it, the journée is released');
-- Judged at the test's own clock (just after that release), not the real clock: after release the
-- journée has no ranking here, so 30 minutes later released_not_published would rightly fire.
select extensions.is(app_private.fantasy_publication_alarm_at('f6400000-0000-4000-8000-000000000002',app_private.fantasy_publish_not_before('f6400000-0000-4000-8000-000000000002')+interval '1 day'+interval '2 minutes'),null,'and the alarm is gone');

-- ===========================================================================
-- 7. Item B (F7): a moved match
-- ===========================================================================
-- (see fantasy_selection_close_moved_match below: it runs on its own fixture)

-- ===========================================================================
-- 8. The rating poll marks
-- ===========================================================================
select extensions.ok(position('interval ''24 hours 30 minutes''' in (select prosrc from pg_proc where oid='app_private.fantasy_api_rating_candidates()'::regprocedure))>0,
  'the 24 h 30 min mark is in the poll schedule');

select * from extensions.finish();
rollback;
