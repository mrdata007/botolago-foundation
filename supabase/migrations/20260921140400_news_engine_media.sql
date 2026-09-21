-- BotolaGO News Engine — media resolution.
--
-- The engine never mirrors or hotlinks a third-party publisher's editorial
-- photography. A source's declared hero image is recorded in the item's
-- provenance metadata and goes no further.
--
-- A generated article's hero is therefore chosen only from media BotolaGO
-- already owns or has licensed in its own catalog: a club crest, a player
-- photo, or a competition logo. When none exists the hero is null and the
-- public article renders BotolaGO's own editorial graphic. Publication never
-- depends on having someone else's photograph.

create or replace function api.news_engine_resolve_hero_asset(
  p_team_ids uuid[] default '{}',
  p_player_ids uuid[] default '{}',
  p_competition_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  asset_id uuid;
  asset_origin text;
begin
  perform app_private.news_engine_require_service_role();

  -- A player photo is the most specific illustration of a player story.
  if cardinality(coalesce(p_player_ids, '{}')) > 0 then
    select player.photo_asset_id into asset_id
    from app.players player
    where player.id = any (p_player_ids) and player.photo_asset_id is not null
    order by player.display_name
    limit 1;
    if asset_id is not null then
      asset_origin := 'player_photo';
    end if;
  end if;

  if asset_id is null and cardinality(coalesce(p_team_ids, '{}')) > 0 then
    select team.crest_asset_id into asset_id
    from app.teams team
    where team.id = any (p_team_ids) and team.crest_asset_id is not null
    order by team.name
    limit 1;
    if asset_id is not null then
      asset_origin := 'team_crest';
    end if;
  end if;

  if asset_id is null and p_competition_id is not null then
    select competition.logo_asset_id into asset_id
    from app.competitions competition
    where competition.id = p_competition_id and competition.logo_asset_id is not null;
    if asset_id is not null then
      asset_origin := 'competition_logo';
    end if;
  end if;

  return jsonb_build_object(
    'assetId', asset_id,
    'origin', coalesce(asset_origin, 'botolago_editorial_graphic')
  );
end;
$$;

revoke all on function api.news_engine_resolve_hero_asset(uuid[], uuid[], uuid)
from public, anon, authenticated, service_role;
grant execute on function api.news_engine_resolve_hero_asset(uuid[], uuid[], uuid) to service_role;

comment on function api.news_engine_resolve_hero_asset(uuid[], uuid[], uuid) is
  'Chooses a hero from BotolaGO-owned catalog media only; never returns third-party publisher imagery.';
