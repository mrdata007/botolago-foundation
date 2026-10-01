-- The News club chips drew a coloured disc with letters for every club because
-- api.news_team_filters never returned the club's badge. This restates the
-- function exactly as 20260720110107 defined it, plus the two crest fields the
-- football API already returns (validated badges only), so the chips can show
-- the real crest. Same signature, so the existing grants stay in place.

create or replace function api.news_team_filters(p_language text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_language app.language_code := app_private.news_language(p_language);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', team.id,
      'slug', team.slug,
      'name', team.name,
      'shortName', team.short_name,
      'city', team.city,
      'code', team.code,
      'primaryColor', team.primary_color,
      'secondaryColor', team.secondary_color,
      'crestUrl', case
        when media.validation_status = 'validated' then media.source_url
        else null
      end,
      'crestPath', case
        when media.validation_status = 'validated' then media.storage_path
        else null
      end
    ) order by team.name, team.id)
    from app.teams team
    left join app.media_assets media on media.id = team.crest_asset_id
    where team.active and exists (
      select 1 from app.story_teams relation
      join app.article_editions edition on edition.story_id = relation.story_id
      where relation.team_id = team.id
        and edition.language = selected_language
        and app_private.news_is_public(edition)
    )
  ), '[]'::jsonb);
end;
$$;
