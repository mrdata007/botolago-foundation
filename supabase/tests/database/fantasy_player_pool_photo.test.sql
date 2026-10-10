begin;

select extensions.no_plan();

-- api.fantasy_player_pool carries each player's approved photo
-- (20261005090000). The photo is app_private.player_photo_for(player, 'app'):
-- a published release whose rights hold today, or null for the silhouette.
-- Nothing else in the payload changes.

insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('e5000000-0000-4000-8000-000000000001', 'MA', 'MAR')
on conflict do nothing;

insert into app.competitions (id, slug, name, short_name, competition_type, country_id)
values ('e5100000-0000-4000-8000-000000000001', 'pool-photo-league', 'Pool Photo League', 'PPL',
  'league', (select id from app.countries where iso_alpha2 = 'MA'));

insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values ('e5200000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000001',
  '2091/92', '2091-08-01', '2092-06-30', 'active', true);

insert into app.teams (id, slug, name, short_name, code, country_id)
values ('e5400000-0000-4000-8000-000000000001', 'pool-photo-club', 'Pool Photo Club', 'PPC', 'PPC',
  (select id from app.countries where iso_alpha2 = 'MA'));

-- Player 1 gets a published photo; player 2 never has one.
insert into app.players (id, slug, full_name, display_name, position) values
  ('e5500000-0000-4000-8000-000000000001', 'pool-photo-1', 'Pool Photo One', 'P. One', 'forward'),
  ('e5500000-0000-4000-8000-000000000002', 'pool-photo-2', 'Pool Photo Two', 'P. Two', 'defender');

do $$
begin
  perform app_private.record_player_attribute_observation(player_id::uuid, 'date_of_birth',
    '2000-01-01', null, 'provider', 'sportsmonks', 'pool-photo-test', '2026-09-01T00:00:00Z')
  from (values ('e5500000-0000-4000-8000-000000000001'), ('e5500000-0000-4000-8000-000000000002'))
    player(player_id);
  perform app_private.resolve_player_attributes(array[
    'e5500000-0000-4000-8000-000000000001'::uuid, 'e5500000-0000-4000-8000-000000000002'::uuid]);
end;
$$;

insert into app.fantasy_competitions (id, football_competition_id, slug, name, active)
values ('e5600000-0000-4000-8000-000000000001', 'e5100000-0000-4000-8000-000000000001',
  'pool-photo-fantasy', 'Pool Photo Fantasy', true);

insert into app.fantasy_seasons (
  id, fantasy_competition_id, football_season_id, ruleset_id, name, status, starts_at, ends_at
) values ('e5630000-0000-4000-8000-000000000001', 'e5600000-0000-4000-8000-000000000001',
  'e5200000-0000-4000-8000-000000000001', 'f6100000-0000-4000-8000-000000000100',
  '2091/92', 'active', '2091-08-01', '2092-06-30');

insert into app.fantasy_players (
  id, fantasy_season_id, football_player_id, football_team_id, position_id, price
) values
  ('e5700000-0000-4000-8000-000000000001', 'e5630000-0000-4000-8000-000000000001',
   'e5500000-0000-4000-8000-000000000001', 'e5400000-0000-4000-8000-000000000001',
   (select id from app.fantasy_positions where code = 'FWD'), 9),
  ('e5700000-0000-4000-8000-000000000002', 'e5630000-0000-4000-8000-000000000001',
   'e5500000-0000-4000-8000-000000000002', 'e5400000-0000-4000-8000-000000000001',
   (select id from app.fantasy_positions where code = 'DEF'), 5);

create function pg_temp.pool_item(p_fantasy_player uuid)
returns jsonb language sql as $$
  select item
  from jsonb_array_elements(
    api.fantasy_player_pool('e5630000-0000-4000-8000-000000000001', null, null, null, null, null, null, 100)
      -> 'items') item
  where item ->> 'id' = p_fantasy_player::text;
$$;

-- ---------------------------------------------------------------------------
-- Before any release: every item says `photo: null`
-- ---------------------------------------------------------------------------
select extensions.ok(
  pg_temp.pool_item('e5700000-0000-4000-8000-000000000001') ? 'photo',
  'each item carries a photo key'
);
select extensions.is(
  pg_temp.pool_item('e5700000-0000-4000-8000-000000000001') -> 'photo',
  'null'::jsonb,
  'no release yet: the photo is null, so the app draws the silhouette'
);
select extensions.is(
  (select array_agg(key order by key) from jsonb_object_keys(
    pg_temp.pool_item('e5700000-0000-4000-8000-000000000001')) key),
  array['crestAssetId', 'footballPlayerId', 'footballTeamId', 'fullName', 'id', 'name',
    'photo', 'photoAssetId', 'position', 'price', 'selectedByCount', 'status', 'teamName',
    'teamShortName'],
  'every existing key is still there; photo is the only addition'
);

-- ---------------------------------------------------------------------------
-- A published release: the item carries the public derivative
-- ---------------------------------------------------------------------------
create temporary table r on commit drop as
select app_private.submit_player_photo_release(
  'e5500000-0000-4000-8000-000000000001',
  'players/e5500000-0000-4000-8000-000000000001/c0000001-0000-4000-8000-000000000001.jpg',
  'players/e5500000-0000-4000-8000-000000000001/release-1.pdf',
  date '2026-09-01', date '2026-09-02', 'player', 'in_app', 'club_licence',
  'Club photographer', 'Pool Photo Club', null, 'b9000000-0000-4000-8000-000000000001') as release_id;

insert into storage.objects (bucket_id, name) values
  ('player-photo-intake',
   'players/e5500000-0000-4000-8000-000000000001/c0000001-0000-4000-8000-000000000001.jpg'),
  ('player-photo-releases', 'players/e5500000-0000-4000-8000-000000000001/release-1.pdf');

select app_private.approve_player_photo_release(
  (select release_id from r), 'b9000000-0000-4000-8000-000000000002');

alter table r add column public_path text;
update r set public_path =
  'football/players/e5500000-0000-4000-8000-000000000001/' || release_id || '.webp';
insert into storage.objects (bucket_id, name) values ('football-media', (select public_path from r));
select app_private.publish_player_photo_release(
  (select release_id from r), (select public_path from r), 512, 512, 'image/webp');

select extensions.is(
  pg_temp.pool_item('e5700000-0000-4000-8000-000000000001') -> 'photo' ->> 'storagePath',
  (select public_path from r),
  'a published release: the item carries the public derivative''s path'
);
select extensions.is(
  pg_temp.pool_item('e5700000-0000-4000-8000-000000000001') -> 'photo',
  app_private.player_photo_for('e5500000-0000-4000-8000-000000000001', 'app'),
  'the photo is exactly the photo programme''s own read'
);
select extensions.is(
  pg_temp.pool_item('e5700000-0000-4000-8000-000000000002') -> 'photo',
  'null'::jsonb,
  'a player without a release keeps a null photo'
);

-- The anonymous landing page reads the pool; it sees the same photo. (The
-- temp table `r` is not readable as anon, so the path is matched by shape.)
set local role anon;
select extensions.matches(
  pg_temp.pool_item('e5700000-0000-4000-8000-000000000001') -> 'photo' ->> 'storagePath',
  '^football/players/e5500000-0000-4000-8000-000000000001/[0-9a-f-]{36}\.webp$',
  'an anonymous visitor gets the approved photo too'
);
reset role;

-- ---------------------------------------------------------------------------
-- Revocation takes the photo out of the list at once
-- ---------------------------------------------------------------------------
select app_private.revoke_player_photo_release(
  (select release_id from r), 'player withdrew consent', 'b9000000-0000-4000-8000-000000000002');

select extensions.is(
  pg_temp.pool_item('e5700000-0000-4000-8000-000000000001') -> 'photo',
  'null'::jsonb,
  'a revoked release: the photo is null again'
);

select * from extensions.finish();
rollback;
