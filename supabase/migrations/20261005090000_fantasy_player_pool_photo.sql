-- The Fantasy player list carries each player's approved photo.
--
-- api.fantasy_player_pool has always returned `photoAssetId`, the raw
-- app.players.photo_asset_id. A client cannot draw a photo from that: the
-- public file's path is built from the release, not the asset
-- (`football/players/<player_id>/<release_id>.webp`, 20260926070000), and the
-- asset id alone does not say whether the release's rights still hold today.
--
-- Each item now also carries `photo`: app_private.player_photo_for(player,
-- 'app'), the one read the photo programme allows (PEPITES_ARCHITECTURE.md
-- §3.3). It is the published derivative of a release whose rights hold on the
-- day — date of birth known, guardian release under 18, not expired, not
-- revoked — or null, and the app then draws the club-shirt silhouette. Nothing
-- else changes: signature, filters, keyset order, cursor and every existing
-- key are as they were, so current clients keep working; `photoAssetId` stays
-- for them.
--
-- `create or replace` keeps the function's grants (anon, authenticated,
-- service_role) from 20260720141854.

create or replace function api.fantasy_player_pool(
  p_season_id uuid,
  p_position text default null,
  p_team_id uuid default null,
  p_max_price numeric default null,
  p_search text default null,
  p_after_price numeric default null,
  p_after_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare items jsonb;
begin
  if p_limit not between 1 and 100 or ((p_after_price is null) <> (p_after_id is null))
    or (p_position is not null and p_position not in ('GK','DEF','MID','FWD'))
  then raise exception using errcode = 'PT400', message = 'validation_failed'; end if;
  with candidates as (
    select fantasy_player.*, position.code as position_code,
      football_player.display_name, football_player.full_name, football_player.photo_asset_id,
      football_team.name as team_name, football_team.short_name as team_short_name,
      football_team.crest_asset_id
    from app.fantasy_players fantasy_player
    join app.fantasy_positions position on position.id = fantasy_player.position_id
    join app.players football_player on football_player.id = fantasy_player.football_player_id
    join app.teams football_team on football_team.id = fantasy_player.football_team_id
    where fantasy_player.fantasy_season_id = p_season_id
      and fantasy_player.active and fantasy_player.eligible
      and (p_position is null or position.code = p_position)
      and (p_team_id is null or football_team.id = p_team_id)
      and (p_max_price is null or fantasy_player.price <= p_max_price)
      and (p_search is null or
        to_tsvector('simple', coalesce(football_player.display_name, '') || ' ' || coalesce(football_player.full_name, ''))
          @@ websearch_to_tsquery('simple', left(p_search, 80)))
      and (p_after_price is null or (fantasy_player.price, fantasy_player.id) < (p_after_price, p_after_id))
    order by fantasy_player.price desc, fantasy_player.id desc limit p_limit + 1
  ), page as (select * from candidates limit p_limit)
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'footballPlayerId', football_player_id, 'footballTeamId', football_team_id,
      'name', display_name, 'fullName', full_name, 'position', position_code,
      'price', price, 'status', status, 'teamName', team_name,
      'teamShortName', team_short_name, 'photoAssetId', photo_asset_id,
      'photo', app_private.player_photo_for(football_player_id, 'app'),
      'crestAssetId', crest_asset_id, 'selectedByCount', selected_by_count
    ) order by price desc, id desc), '[]'::jsonb),
    'nextCursor', case when (select count(*) from candidates) > p_limit then
      (select jsonb_build_object('price', price, 'id', id) from page order by price, id limit 1)
      else null end
  ) into items from page;
  return items;
end;
$$;
