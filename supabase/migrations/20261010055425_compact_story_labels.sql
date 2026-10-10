-- Rail labels are independent of complete bilingual article headlines. The
-- database enforces compact captions for every current/future generated story;
-- the image model cannot enlarge the rail by returning prose.
create function app_private.ai_story_club_code(p_name text)
returns text language sql immutable security invoker set search_path='' as $$
 select case lower(btrim(p_name))
   when 'raja casablanca' then 'RCA' when 'raja club athletic' then 'RCA' when 'raja ca' then 'RCA'
   when 'wydad casablanca' then 'WAC' when 'wydad athletic club' then 'WAC' when 'wydad ac' then 'WAC'
   when 'widad témara' then 'WST' when 'widad temara' then 'WST'
   when 'maghreb fès' then 'MAS' when 'maghreb fes' then 'MAS' when 'maghreb association sportive de fès' then 'MAS'
   when 'far rabat' then 'FAR' when 'as far' then 'FAR'
   when 'hassania agadir' then 'HUSA' when 'hassania union sport agadir' then 'HUSA'
   when 'cr khemis zemamra' then 'RCAZ' when 'renaissance zemamra' then 'RCAZ' when 'renaissance club athletic zemamra' then 'RCAZ'
   when 'fus rabat' then 'FUS' when 'fath union sport' then 'FUS'
   when 'rsb berkane' then 'RSB' when 'rs berkane' then 'RSB' when 'renaissance berkane' then 'RSB' when 'renaissance sportive de berkane' then 'RSB'
   when 'ittihad tanger' then 'IRT' when 'ittihad riadi de tanger' then 'IRT'
   when 'maghreb tétouan' then 'MAT' when 'moghreb tétouan' then 'MAT'
   when 'olympic safi' then 'OCS' when 'olympique safi' then 'OCS' when 'olympique club de safi' then 'OCS'
   when 'difaâ el jadida' then 'DHJ' when 'difaa el jadida' then 'DHJ'
   when 'uts rabat' then 'UTS' when 'union touarga' then 'UTS' when 'union touarga sport' then 'UTS'
   when 'js soualem' then 'JSS' when 'jeunesse sportive soualem' then 'JSS'
   when 'mouloudia oujda' then 'MCO' when 'mouloudia club oujda' then 'MCO'
   when 'kawkab marrakech' then 'KACM' when 'kawkab athletic club marrakech' then 'KACM'
   when 'olympique dcheira' then 'OD' when 'olympique dcheïra' then 'OD'
   when 'youssoufia berrechid' then 'CAYB' when 'chabab mohammedia' then 'SCCM' when 'chabab mohammédia' then 'SCCM'
   when 'amal tiznit' then 'AMT' when 'codm meknès' then 'CODM' when 'codm meknes' then 'CODM'
   when 'yacoub el mansour' then 'YEM'
   else case when btrim(p_name) ~ '^[A-Z0-9]{2,4}$' then btrim(p_name) else null end
 end
$$;
create function app_private.ai_home_story_rail_label(p_context jsonb)
returns text language sql immutable security invoker set search_path='' as $$
 select case when home_code is not null and away_code is not null and home_code<>away_code
   then home_code||' V '||away_code
   else coalesce(home_code,away_code,app_private.ai_story_club_code(p_context->'clubs'->>0),'ACTU') end
 from (select app_private.ai_story_club_code(p_context->'match'->>'home') home_code,
              app_private.ai_story_club_code(p_context->'match'->>'away') away_code) codes
$$;
revoke all on function app_private.ai_story_club_code(text),app_private.ai_home_story_rail_label(jsonb) from public,anon,authenticated,service_role;

create or replace function app_private.ai_home_story_visual_context(p_story uuid,p_edition uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select context.value || jsonb_build_object('railLabel',app_private.ai_home_story_rail_label(context.value)) from lateral (select jsonb_build_object(
   'article',left(regexp_replace(e.body_html,'<[^>]+>',' ','g'),3000),
   'kind',a.kind,
   'match',case when f.id is not null then jsonb_build_object(
     'home',h.name,'away',v.name,'homeScore',f.home_score,'awayScore',f.away_score,
     'status',f.status,'kickoff',f.kickoff_at) else null end,
   'clubs',(select coalesce(jsonb_agg(t.name),'[]'::jsonb) from app.story_teams st join app.teams t on t.id=st.team_id where st.story_id=p_story)) as value
 from app.article_editions e
 left join app_private.ai_content_articles a on a.article_edition_id=e.id
 left join app.fixtures f on f.id=a.fixture_id
 left join app.teams h on h.id=f.home_team_id
 left join app.teams v on v.id=f.away_team_id
 where e.id=p_edition and e.story_id=p_story) context
$$;
revoke all on function app_private.ai_home_story_visual_context(uuid,uuid) from public,anon,authenticated,service_role;


create or replace function app_private.home_story_dto(story app.home_stories)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',story.id,'titleFr',story.title_fr,'titleAr',story.title_ar,
    'altFr',story.alt_fr,'altAr',story.alt_ar,'mediaAssetId',story.media_asset_id,
    'storagePath',media.storage_path,'credit',story.credit,'destination',null,
    'position',story.position,'published',story.published,'version',story.version,
    'generated',job.id is not null,
    'railLabel',case when job.id is not null then app_private.ai_home_story_rail_label(job.visual_context) else null end)
  from app.media_assets media left join app_private.ai_home_story_jobs job on job.home_story_id=story.id
  where media.id=story.media_asset_id
$$;
