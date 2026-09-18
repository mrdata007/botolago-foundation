begin;

select extensions.no_plan();

-- BG-0031: api.ingest_football_catalog_entity season UPDATE branch is monotone and
-- correction-aware, and app.seasons.bounds_locked_at pins starts_on/ends_on against
-- every UPDATE that does not itself change the lock.

create function pg_temp.mapped_id(p_entity_type text, p_external_id text)
returns uuid language sql stable as $$
  select internal_entity_id
  from app_private.football_provider_mappings
  where provider_name = 'sportsmonks'
    and entity_type = p_entity_type::app_private.football_entity_type
    and external_id = p_external_id
    and active
$$;

-- ---------------------------------------------------------------- schema
select extensions.ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'app' and table_name = 'seasons' and column_name = 'bounds_locked_at'
      and data_type = 'timestamp with time zone' and is_nullable = 'YES'
  ),
  'app.seasons.bounds_locked_at is a nullable timestamptz'
);
select extensions.ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'app' and table_name = 'seasons' and column_name = 'bounds_locked_reason'
      and data_type = 'text' and is_nullable = 'YES'
  ),
  'app.seasons.bounds_locked_reason is a nullable text'
);
select extensions.ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'app.seasons'::regclass
      and tgname = 'seasons_protect_locked_bounds'
      and not tgisinternal
  ),
  'seasons_protect_locked_bounds trigger is installed on app.seasons'
);

-- ---------------------------------------------------------------- catalog setup
select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'competition', '860',
    '{
      "externalId":"860",
      "name":"Botola Pro",
      "shortName":"BPL",
      "type":"league",
      "countryCode":"MA",
      "freshness":{
        "updatedAt":"2026-09-18T10:00:00Z",
        "sourceSequence":1,
        "sourceVersion":"sportsmonks:860:v1",
        "provisional":false
      }
    }'::jsonb
  ) ->> 'outcome',
  'inserted',
  'competition ingestion creates the parent mapping'
);

select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'season', '28647',
    '{
      "externalId":"28647",
      "competitionExternalId":"860",
      "label":"2026/2027",
      "startsOn":"2026-09-24",
      "endsOn":"2026-12-31",
      "current":true,
      "freshness":{
        "updatedAt":"2026-09-18T10:01:00Z",
        "sourceSequence":2,
        "sourceVersion":"sportsmonks:28647:v1",
        "provisional":false
      }
    }'::jsonb
  ) ->> 'outcome',
  'inserted',
  'season ingestion inserts the season (insert branch is unchanged)'
);
select extensions.is(
  (select ends_on from app.seasons where id = pg_temp.mapped_id('season', '28647')),
  date '2026-12-31',
  'inserted season carries the provider ends_on'
);

insert into app.teams (id, slug, name, short_name, code, country_id)
values
  (
    '61000000-0000-4000-8000-000000000031', 'bounds-home',
    'Bounds Home', 'BHOME', 'BHM', (select id from app.countries where iso_alpha2 = 'MA')
  ),
  (
    '61000000-0000-4000-8000-000000000032', 'bounds-away',
    'Bounds Away', 'BAWAY', 'BAW', (select id from app.countries where iso_alpha2 = 'MA')
  );

-- Only published fixture: kickoff on the season start day (the production shape).
insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id,
  kickoff_at, status, period, provider_updated_at, source_sequence, source_version
) values (
  '91000000-0000-4000-8000-000000000031',
  pg_temp.mapped_id('competition', '860'),
  pg_temp.mapped_id('season', '28647'),
  '61000000-0000-4000-8000-000000000031',
  '61000000-0000-4000-8000-000000000032',
  '2026-09-24T00:00:00Z', 'scheduled', 'pre_match',
  '2026-09-18T09:00:00Z', 1, 'v1'
);

-- Bridged membership: valid_to beyond the stored ends_on (the production shape).
insert into app.players (id, slug, full_name, display_name, position)
values (
  '70000000-0000-4000-8000-000000000031', 'bounds-player',
  'Bounds Player', 'B. Player', 'midfielder'
);
insert into app.team_memberships (
  id, player_id, team_id, season_id, shirt_number, valid_from, valid_to
) values (
  '80000000-0000-4000-8000-000000000031',
  '70000000-0000-4000-8000-000000000031',
  '61000000-0000-4000-8000-000000000031',
  pg_temp.mapped_id('season', '28647'), 8, '2026-09-24', '2027-06-30'
);

-- Staged fantasy season ending before the membership horizon: the floor must
-- take the greatest of all sources, not the fantasy season alone.
insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values (
  'f6000000-0000-4000-8000-000000000031', pg_temp.mapped_id('competition', '860'),
  'bounds-guard-test', 'Bounds Guard Test', true
);
insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values (
  'f6300000-0000-4000-8000-000000000031', 'f6000000-0000-4000-8000-000000000031',
  pg_temp.mapped_id('season', '28647'), 'f6100000-0000-4000-8000-000000000100',
  '2026/27 bounds guard', 'planned', '2026-09-24T00:00:00Z', '2027-05-31T23:59:59.999999Z'
);

-- Floor for 28647 = greatest(existing 2026-12-31, fixture 2026-09-24,
--   membership 2027-06-30, fantasy 2027-05-31) = 2027-06-30. First kickoff = 2026-09-24.

-- ---------------------------------------------------------------- case 1
-- Regression replay: provider endsOn shrinks to the start day.
select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'season', '28647',
    '{
      "externalId":"28647",
      "competitionExternalId":"860",
      "label":"2026/2027",
      "startsOn":"2026-09-24",
      "endsOn":"2026-09-24",
      "current":true,
      "freshness":{
        "updatedAt":"2026-09-18T10:02:00Z",
        "sourceSequence":3,
        "sourceVersion":"sportsmonks:28647:v2",
        "provisional":false
      }
    }'::jsonb
  ) - 'id',
  '{"outcome":"updated","endsOnPreserved":true,"startsOnPreserved":false}'::jsonb,
  'case 1: a provider endsOn below the fixtures/memberships floor is reported as preserved'
);
select extensions.is(
  (select ends_on from app.seasons where id = pg_temp.mapped_id('season', '28647')),
  date '2026-12-31',
  'case 1: ends_on is kept when the provider value would shrink the season'
);
select extensions.is(
  (select starts_on from app.seasons where id = pg_temp.mapped_id('season', '28647')),
  date '2026-09-24',
  'case 1: starts_on equal to the first fixture date is accepted unchanged'
);

-- Floor source check: a provider endsOn above the stored value but below the
-- membership horizon is still below the floor and therefore preserved.
select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'season', '28647',
    '{
      "externalId":"28647",
      "competitionExternalId":"860",
      "label":"2026/2027",
      "startsOn":"2026-09-24",
      "endsOn":"2027-03-31",
      "current":true,
      "freshness":{
        "updatedAt":"2026-09-18T10:03:00Z",
        "sourceSequence":4,
        "sourceVersion":"sportsmonks:28647:v3",
        "provisional":false
      }
    }'::jsonb
  ) ->> 'endsOnPreserved',
  'true',
  'case 1b: the floor includes team_memberships.valid_to, not only the stored ends_on'
);
select extensions.is(
  (select ends_on from app.seasons where id = pg_temp.mapped_id('season', '28647')),
  date '2026-12-31',
  'case 1b: the stored ends_on is kept below the membership horizon'
);

-- ---------------------------------------------------------------- case 3
-- A later, larger endsOn (above every floor source) is accepted.
select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'season', '28647',
    '{
      "externalId":"28647",
      "competitionExternalId":"860",
      "label":"2026/2027",
      "startsOn":"2026-09-24",
      "endsOn":"2027-07-05",
      "current":true,
      "freshness":{
        "updatedAt":"2026-09-18T10:04:00Z",
        "sourceSequence":5,
        "sourceVersion":"sportsmonks:28647:v4",
        "provisional":false
      }
    }'::jsonb
  ) - 'id',
  '{"outcome":"updated","endsOnPreserved":false,"startsOnPreserved":false}'::jsonb,
  'case 3: a larger endsOn is not preserved'
);
select extensions.is(
  (select ends_on from app.seasons where id = pg_temp.mapped_id('season', '28647')),
  date '2027-07-05',
  'case 3: ends_on extends to the later provider value'
);

-- starts_on rule: a provider start later than the first published fixture is kept.
select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'season', '28647',
    '{
      "externalId":"28647",
      "competitionExternalId":"860",
      "label":"2026/2027",
      "startsOn":"2026-10-01",
      "endsOn":"2027-07-05",
      "current":true,
      "freshness":{
        "updatedAt":"2026-09-18T10:05:00Z",
        "sourceSequence":6,
        "sourceVersion":"sportsmonks:28647:v5",
        "provisional":false
      }
    }'::jsonb
  ) - 'id',
  '{"outcome":"updated","endsOnPreserved":false,"startsOnPreserved":true}'::jsonb,
  'case 3b: a provider start after the first fixture is reported as preserved'
);
select extensions.is(
  (select starts_on from app.seasons where id = pg_temp.mapped_id('season', '28647')),
  date '2026-09-24',
  'case 3b: starts_on stays at the stored value'
);
select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'season', '28647',
    '{
      "externalId":"28647",
      "competitionExternalId":"860",
      "label":"2026/2027",
      "startsOn":"2026-09-20",
      "endsOn":"2027-07-05",
      "current":true,
      "freshness":{
        "updatedAt":"2026-09-18T10:06:00Z",
        "sourceSequence":7,
        "sourceVersion":"sportsmonks:28647:v6",
        "provisional":false
      }
    }'::jsonb
  ) ->> 'startsOnPreserved',
  'false',
  'case 3c: a provider start on or before the first fixture is accepted'
);
select extensions.is(
  (select starts_on from app.seasons where id = pg_temp.mapped_id('season', '28647')),
  date '2026-09-20',
  'case 3c: starts_on moves earlier with the provider'
);

-- ---------------------------------------------------------------- case 2
-- endsOn == startsOn is provisional even when it is not below the floor.
select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'season', '28648',
    '{
      "externalId":"28648",
      "competitionExternalId":"860",
      "label":"2027/2028",
      "startsOn":"2027-09-01",
      "endsOn":"2027-09-01",
      "current":false,
      "freshness":{
        "updatedAt":"2026-09-18T10:07:00Z",
        "sourceSequence":8,
        "sourceVersion":"sportsmonks:28648:v1",
        "provisional":false
      }
    }'::jsonb
  ) ->> 'outcome',
  'inserted',
  'case 2: a one-day season can be inserted'
);
insert into app.fixtures (
  id, competition_id, season_id, home_team_id, away_team_id,
  kickoff_at, status, period, provider_updated_at, source_sequence, source_version
) values (
  '91000000-0000-4000-8000-000000000032',
  pg_temp.mapped_id('competition', '860'),
  pg_temp.mapped_id('season', '28648'),
  '61000000-0000-4000-8000-000000000032',
  '61000000-0000-4000-8000-000000000031',
  '2027-09-01T18:00:00Z', 'scheduled', 'pre_match',
  '2026-09-18T09:00:00Z', 1, 'v1'
);
-- Floor for 28648 = greatest(existing 2027-09-01, fixture 2027-09-01) = 2027-09-01;
-- the provider value 2027-09-05 is above it, so only the equality rule applies.
select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'season', '28648',
    '{
      "externalId":"28648",
      "competitionExternalId":"860",
      "label":"2027/2028",
      "startsOn":"2027-09-05",
      "endsOn":"2027-09-05",
      "current":false,
      "freshness":{
        "updatedAt":"2026-09-18T10:08:00Z",
        "sourceSequence":9,
        "sourceVersion":"sportsmonks:28648:v2",
        "provisional":false
      }
    }'::jsonb
  ) - 'id',
  '{"outcome":"updated","endsOnPreserved":true,"startsOnPreserved":true}'::jsonb,
  'case 2: endsOn equal to startsOn is provisional and the later start is kept behind the fixture'
);
select extensions.is(
  (select array[starts_on, ends_on] from app.seasons where id = pg_temp.mapped_id('season', '28648')),
  array[date '2027-09-01', date '2027-09-01'],
  'case 2: the one-day season bounds are unchanged'
);

-- ---------------------------------------------------------------- case 4
-- Owner lock: setting the lock together with the bounds is the explicit path.
update app.seasons
   set bounds_locked_at = '2026-09-18T12:00:00Z',
       bounds_locked_reason = 'BG-0031 test lock',
       starts_on = date '2026-09-24',
       ends_on = date '2027-06-30'
 where id = pg_temp.mapped_id('season', '28647');
select extensions.is(
  (select array[starts_on, ends_on] from app.seasons where id = pg_temp.mapped_id('season', '28647')),
  array[date '2026-09-24', date '2027-06-30'],
  'case 4a: an UPDATE that sets bounds_locked_at changes the bounds'
);

-- A provider update the RPC itself would accept (later end, earlier start) is
-- neutralised by the trigger while the lock is unchanged.
select extensions.is(
  api.ingest_football_catalog_entity(
    'sportsmonks', 'season', '28647',
    '{
      "externalId":"28647",
      "competitionExternalId":"860",
      "label":"2026/2027",
      "startsOn":"2026-09-01",
      "endsOn":"2028-01-01",
      "current":true,
      "freshness":{
        "updatedAt":"2026-09-18T10:09:00Z",
        "sourceSequence":10,
        "sourceVersion":"sportsmonks:28647:v7",
        "provisional":false
      }
    }'::jsonb
  ) ->> 'outcome',
  'updated',
  'case 4b: the provider update still completes (mapping refreshed)'
);
select extensions.is(
  (select array[starts_on, ends_on] from app.seasons where id = pg_temp.mapped_id('season', '28647')),
  array[date '2026-09-24', date '2027-06-30'],
  'case 4b: locked bounds survive a provider update'
);
select extensions.is(
  (select bounds_locked_at from app.seasons where id = pg_temp.mapped_id('season', '28647')),
  '2026-09-18T12:00:00Z'::timestamptz,
  'case 4b: the provider update does not touch the lock'
);

update app.seasons set ends_on = date '2027-07-31'
 where id = pg_temp.mapped_id('season', '28647');
select extensions.is(
  (select ends_on from app.seasons where id = pg_temp.mapped_id('season', '28647')),
  date '2027-06-30',
  'case 4c: a plain UPDATE that leaves the lock untouched cannot move ends_on'
);

update app.seasons
   set ends_on = date '2027-07-31',
       bounds_locked_at = '2026-09-18T13:00:00Z',
       bounds_locked_reason = 'BG-0031 test correction'
 where id = pg_temp.mapped_id('season', '28647');
select extensions.is(
  (select ends_on from app.seasons where id = pg_temp.mapped_id('season', '28647')),
  date '2027-07-31',
  'case 4d: an explicit owner correction that re-stamps bounds_locked_at changes ends_on'
);

update app.seasons
   set ends_on = date '2027-08-31',
       bounds_locked_at = null,
       bounds_locked_reason = null
 where id = pg_temp.mapped_id('season', '28647');
select extensions.is(
  (select ends_on from app.seasons where id = pg_temp.mapped_id('season', '28647')),
  date '2027-08-31',
  'case 4e: clearing the lock is an explicit path and changes ends_on'
);

select * from extensions.finish();
rollback;
