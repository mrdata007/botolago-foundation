-- 20261030100200: a rating poll is due 24 h 30 min after full time, so the
-- Not-rated rule's two reads 24 hours apart can be satisfied at about 24.5 h.
begin;

select extensions.no_plan();

insert into app.countries (id, iso_alpha2, iso_alpha3) values ('f0000000-0000-4000-8000-000000000001', 'XZ', 'XZZ');
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('f1000000-0000-4000-8000-000000000001', 'poll-test', 'Poll Test', 'PT', 'league', 'f0000000-0000-4000-8000-000000000001');
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', '2089/90', '2026-08-01', '2090-06-30', 'active', true);
insert into app.rounds (id, season_id, round_number, name, status)
values ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 1, 'Gameweek 1', 'active');
insert into app.teams (id, slug, name, short_name, code, country_id)
select ('f4' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000001')::uuid, 'poll-club-' || i, 'Poll Club ' || i,
  'PC' || i, 'P' || lpad(i::text, 2, '0'), 'f0000000-0000-4000-8000-000000000001' from generate_series(1, 2) i;
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('f6000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'poll-test', 'Poll Test', true);
insert into app.fantasy_seasons (id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at)
values ('f6300000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
  'f6100000-0000-4000-8000-000000000100', '2089/90', 'active', '2026-08-01', '2090-06-30');
insert into app.fantasy_gameweeks (id, fantasy_season_id, football_round_id, sequence_number, name, deadline_at, starts_at, ends_at, status)
values ('f6400000-0000-4000-8000-000000000001', 'f6300000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
  1, 'Gameweek 1', '2090-01-01T11:00:00Z', '2090-01-01T12:00:00Z', '2090-01-08T12:00:00Z', 'open');
insert into app_private.fantasy_api_rating_seasons(season_id, from_gameweek, owner_approval)
values ('f6300000-0000-4000-8000-000000000001', 1, 'Test owner authorized native rating polls');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update app.fantasy_gameweeks set status = 'provisional', deadline_at = now() - interval '4 days',
  starts_at = now() - interval '3 days', ends_at = now() - interval '2 days' where id = 'f6400000-0000-4000-8000-000000000001';
insert into app.fixtures(id, competition_id, season_id, round_id, home_team_id, away_team_id, kickoff_at, status,
  home_score, away_score, provider_updated_at, source_sequence, source_version, finalized_at)
values ('fa100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001', 'f4000001-0000-4000-8000-000000000001', 'f4000002-0000-4000-8000-000000000001',
  now() - interval '3 days', 'finished', 0, 0, now() - interval '2 days', 10, 'poll-test-v1', now() - interval '25 hours');
insert into app.fantasy_fixture_assignments(fantasy_season_id, fixture_id, gameweek_id, original_gameweek_id,
  original_kickoff_at, assigned_kickoff_at, frozen_at, source_version)
values ('f6300000-0000-4000-8000-000000000001', 'fa100000-0000-4000-8000-000000000001', 'f6400000-0000-4000-8000-000000000001',
  'f6400000-0000-4000-8000-000000000001', now() - interval '3 days', now() - interval '3 days', now() - interval '4 days', 1);
insert into app_private.football_provider_mappings(provider_name, entity_type, external_id, internal_entity_id, source_version, last_seen_at)
values ('sofascore', 'fixture', '9101', 'fa100000-0000-4000-8000-000000000001', 'test', now());

create function pg_temp.due() returns boolean language sql as $$
  select exists (select 1 from app_private.fantasy_api_rating_candidates()) $$;
create function pg_temp.at(full_time_age interval, last_read_age interval) returns void language plpgsql as $$
begin
  perform set_config('app.allow_fixture_correction', 'on', true);
  set local session_replication_role = replica;
  update app.fixtures set finalized_at = now() - full_time_age where id = 'fa100000-0000-4000-8000-000000000001';
  set local session_replication_role = origin;
  delete from app_private.fantasy_api_rating_polls;
  if last_read_age is not null then
    insert into app_private.fantasy_api_rating_polls(fixture_id, last_fetched_at, last_attempt_at)
    values ('fa100000-0000-4000-8000-000000000001', now() - last_read_age, now() - greatest(last_read_age, interval '31 minutes'));
  end if;
end $$;

-- Read at 24 h 05: the 24 h mark is served; nothing is due at 24 h 29.
select pg_temp.at(interval '24 hours 29 minutes', interval '24 minutes');
select extensions.ok(not pg_temp.due(), 'read at 24 h 05, nothing is due at 24 h 29 min');
-- At 24 h 31 the new mark is due: the read at 24 h 05 predates it.
select pg_temp.at(interval '24 hours 31 minutes', interval '26 minutes');
select extensions.ok(pg_temp.due(), 'a poll is due at 24 h 31 min after a read at 24 h 05 (the new mark)');
-- Once read after the mark, nothing is due until 48 h.
select pg_temp.at(interval '24 hours 40 minutes', interval '5 minutes');
select extensions.ok(not pg_temp.due(), 'read at 24 h 35, nothing is due');
select pg_temp.at(interval '47 hours', interval '22 hours');
select extensions.ok(not pg_temp.due(), 'nothing is due between the 24 h 30 min read and 48 h');
select pg_temp.at(interval '48 hours 1 minute', interval '23 hours');
select extensions.ok(pg_temp.due(), 'the 48 h mark still polls');
-- The older marks are unchanged.
select pg_temp.at(interval '16 minutes', null);
select extensions.ok(pg_temp.due(), 'the 15 min mark still polls');
select pg_temp.at(interval '2 hours', interval '55 minutes');
select extensions.ok(not pg_temp.due(), 'the 1 h mark was served');
select pg_temp.at(interval '24 hours 1 minute', interval '12 hours 30 minutes');
select extensions.ok(pg_temp.due(), 'the 24 h mark still polls');
-- A rating source that is complete is never polled again, mark or no mark.
select pg_temp.at(interval '24 hours 31 minutes', interval '26 minutes');
select extensions.ok(pg_temp.due(), 'due again at 24 h 31 min');
insert into app_private.fantasy_api_rating_sources(fixture_id, event_id, digest, players, ready, captured_at)
select 'fa100000-0000-4000-8000-000000000001', '9101', repeat('a', 64),
  (select jsonb_agg(jsonb_build_object('externalId', n::text)) from generate_series(1, 22) n), true, now();
select extensions.ok(not pg_temp.due(), 'a complete rating source needs no poll');

select * from extensions.finish();
rollback;
