begin;

select extensions.no_plan();
select set_config('app.environment', 'test', true);

-- 20261013120100 (catalog snapshot, apply, record image) and 20261013120200 (weekly tick).
--   1 privileges   2 snapshot   3 apply updates mapped players only, creates nothing
--   4 images: crest linked, curated crest kept, player copy off photo_asset_id
--   5 the tick's gates
-- NOT RUN in the authoring session (no Docker): CI's database-quality job is the authority.

create function pg_temp.id(p_prefix text, n integer) returns uuid language sql immutable as
  $$ select (p_prefix || '000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into app.countries (id, iso_alpha2, iso_alpha3) values (pg_temp.id('c0', 1), 'MA', 'MAR')
  on conflict do nothing;
insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values (pg_temp.id('c0', 2), 'catalog-test', 'Catalog Test', 'CT', 'league',
  (select id from app.countries where iso_alpha2 = 'MA'));
insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values (pg_temp.id('c0', 3), pg_temp.id('c0', 2), '2026/2027', '2026-08-01', '2027-06-30', 'active', true);
insert into app.teams (id, slug, name, short_name, code, country_id)
select pg_temp.id('c1', i), 'catalog-club-' || i, 'Catalog Club ' || i, 'CC' || i, 'CC' || i,
  (select id from app.countries where iso_alpha2 = 'MA') from generate_series(1, 2) i;
insert into app.players (id, slug, full_name, display_name, position)
values (pg_temp.id('b1', 1), 'catalog-player-1', 'Catalog Player One', 'Catalog Player One', 'midfielder'),
  (pg_temp.id('b1', 2), 'catalog-player-2', 'Catalog Player Two', 'Catalog Player Two', 'defender'),
  (pg_temp.id('b1', 3), 'catalog-player-3', 'Catalog Player Three', 'Catalog Player Three', 'forward');
insert into app.team_memberships (player_id, team_id, season_id, shirt_number, valid_from)
values (pg_temp.id('b1', 1), pg_temp.id('c1', 1), pg_temp.id('c0', 3), 8, '2026-08-01'),
  (pg_temp.id('b1', 2), pg_temp.id('c1', 1), pg_temp.id('c0', 3), 4, '2026-08-01'),
  (pg_temp.id('b1', 3), pg_temp.id('c1', 1), pg_temp.id('c0', 3), 9, '2026-08-01');

insert into app_private.football_provider_mappings (provider_name, entity_type, external_id, internal_entity_id,
  source_version, last_seen_at)
values ('sofascore', 'team', '7001', pg_temp.id('c1', 1), 'v', '2026-10-01 00:00Z'),
  ('sofascore', 'team', '7002', pg_temp.id('c1', 2), 'v', '2026-10-01 00:00Z'),
  ('sofascore', 'player', '8001', pg_temp.id('b1', 1), 'v', '2026-10-01 00:00Z'),
  ('sofascore', 'player', '8002', pg_temp.id('b1', 2), 'v', '2026-10-01 00:00Z');
-- player 3 has no SofaScore mapping on purpose.

-- 1 privileges
select extensions.ok(not has_function_privilege('anon', 'api.football_sofascore_catalog_snapshot()', 'execute'), '1.1 snapshot: not callable by visitors');
select extensions.ok(not has_function_privilege('authenticated', 'api.service_sofascore_catalog_apply(jsonb,boolean)', 'execute'), '1.2 apply: not callable by signed-in users');
select extensions.ok(not has_function_privilege('authenticated', 'api.service_sofascore_catalog_record_image(text,text,text,text,text,text,integer)', 'execute'), '1.3 record image: not callable by signed-in users');
select extensions.ok(has_function_privilege('service_role', 'api.service_sofascore_catalog_apply(jsonb,boolean)', 'execute'), '1.4 apply: callable by the service role');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 2 snapshot: only mapped clubs and players, with the current shirt
select extensions.is(jsonb_array_length(api.football_sofascore_catalog_snapshot() -> 'teams'), 2, '2.1 both mapped clubs');
select extensions.is(jsonb_array_length(api.football_sofascore_catalog_snapshot() -> 'players'), 2, '2.2 the unmapped player is not listed');
select extensions.is(
  (select (p ->> 'shirtNumber')::integer from jsonb_array_elements(api.football_sofascore_catalog_snapshot() -> 'players') p where p ->> 'sofascoreId' = '8001'),
  8, '2.3 the current shirt number is there');

-- 3 apply
select extensions.is(
  api.service_sofascore_catalog_apply(jsonb_build_array(
    jsonb_build_object('sofascoreId', '8001', 'teamSofascoreId', '7001', 'displayName', 'New Spelling', 'position', 'forward', 'shirtNumber', 10),
    jsonb_build_object('sofascoreId', '8002', 'teamSofascoreId', '7001', 'shirtNumber', 9),
    jsonb_build_object('sofascoreId', '8999', 'teamSofascoreId', '7001', 'displayName', 'Not Mapped')
  )) - 'noMembership' - 'invalid' - 'shirtConflicts',
  '{"names": 1, "positions": 0, "shirts": 1, "notMapped": 1}'::jsonb,
  '3.1 name and shirt applied; position ignored without the flag; the unmapped id only counted');
select extensions.is(
  (select display_name from app.players where id = pg_temp.id('b1', 1)), 'New Spelling', '3.2 the mapped player was renamed');
select extensions.is(
  (select position::text from app.players where id = pg_temp.id('b1', 1)), 'midfielder', '3.3 position unchanged');
select extensions.is(
  (select shirt_number from app.team_memberships where player_id = pg_temp.id('b1', 2)), 4, '3.4 a number another player holds is left alone (conflict)');
select extensions.is(
  (select count(*)::integer from app.players), 3, '3.5 no player was created');
select extensions.is(
  (select count(*)::integer from app_private.football_provider_mappings where provider_name = 'sofascore' and entity_type = 'player'),
  2, '3.6 no mapping was created');
select extensions.is(
  (select display_name from app.players where id = pg_temp.id('b1', 3)), 'Catalog Player Three', '3.7 an unmapped player is never touched');
select extensions.is(
  (api.service_sofascore_catalog_apply(jsonb_build_array(
    jsonb_build_object('sofascoreId', '8002', 'teamSofascoreId', '7001', 'position', 'midfielder')
  ), true) ->> 'positions')::integer,
  1, '3.8 with the flag, a position is applied');

-- 4 images
select extensions.is(
  api.service_sofascore_catalog_record_image('team', '7001', 'stored', repeat('a', 64),
    'football/sofascore/teams/7001/crest-aaaaaaaaaaaa.png', 'image/png', 1234) ->> 'linked',
  'true', '4.1 a stored crest is linked to the club');
select extensions.is(
  (select m.storage_path from app.teams t join app.media_assets m on m.id = t.crest_asset_id where t.id = pg_temp.id('c1', 1)),
  'football/sofascore/teams/7001/crest-aaaaaaaaaaaa.png', '4.2 through crest_asset_id, as the SportsMonks crest is');
select extensions.is(
  api.service_sofascore_catalog_record_image('team', '7001', 'stored', repeat('b', 64),
    'football/sofascore/teams/7001/crest-bbbbbbbbbbbb.png', 'image/png', 1300) ->> 'previousPath',
  'football/sofascore/teams/7001/crest-aaaaaaaaaaaa.png', '4.3 a changed image reports the path to remove');
select extensions.throws_ok(
  $$select api.service_sofascore_catalog_record_image('team', '7001', 'stored', repeat('c', 64),
    'football/sofascore/teams/7002/crest-cccccccccccc.png', 'image/png', 10)$$,
  '22023', 'INVALID_PROVIDER_PAYLOAD', '4.4 a path for another id is refused');
select extensions.throws_ok(
  $$select api.service_sofascore_catalog_record_image('team', '9999', 'missing')$$,
  'P0002', 'MAPPING_NOT_FOUND', '4.5 no mapping, no row');

reset role;
insert into app.media_assets (id, kind, storage_path, attribution, validation_status, validated_at, mime_type)
values (pg_temp.id('a0', 1), 'team_crest', 'football/teams/7002/crest-curated.png', 'BotolaGO', 'validated', now(), 'image/png');
update app.teams set crest_asset_id = pg_temp.id('a0', 1) where id = pg_temp.id('c1', 2);
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select extensions.is(
  api.service_sofascore_catalog_record_image('team', '7002', 'stored', repeat('d', 64),
    'football/sofascore/teams/7002/crest-dddddddddddd.png', 'image/png', 99) ->> 'linked',
  'false', '4.6 a crest BotolaGO supplied is not replaced');
select extensions.is(
  (select crest_asset_id from app.teams where id = pg_temp.id('c1', 2)), pg_temp.id('a0', 1), '4.7 the club still points at it');

select extensions.is(
  api.service_sofascore_catalog_record_image('player', '8001', 'stored', repeat('e', 64),
    'football/sofascore/players/8001/photo-eeeeeeeeeeee.jpg', 'image/jpeg', 500) ->> 'linked',
  'false', '4.8 a player copy is recorded');
select extensions.is(
  (select catalog_photo_path from app.players where id = pg_temp.id('b1', 1)),
  'football/sofascore/players/8001/photo-eeeeeeeeeeee.jpg', '4.9 on catalog_photo_path');
select extensions.is(
  (select photo_asset_id from app.players where id = pg_temp.id('b1', 1)), null, '4.10 not on photo_asset_id, which belongs to the release pipeline');

-- 5 the weekly tick
reset role;
update app_private.notification_email_settings set football_live_refresh_enabled = false where id;
select extensions.is(app_private.football_catalog_weekly_tick(), 'disabled', '5.1 off with the live refresh switch');
select extensions.ok(exists (select 1 from cron.job where jobname = 'football-catalog-weekly' and schedule = '17 4 * * 0'), '5.2 scheduled weekly');

select * from extensions.finish();
rollback;
