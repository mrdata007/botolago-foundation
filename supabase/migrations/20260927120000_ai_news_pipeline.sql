-- AI news is isolated from human editorial RPCs. Existing MFA and staff roles
-- are unchanged. Both switches start off; only a reviewed DB change may enable
-- them. Service-role calls still pass these server-side checks.
create table app_private.ai_news_settings (
  id boolean primary key default true check (id),
  draft_enabled boolean not null default false,
  source_processing_approved boolean not null default false,
  auto_publish_enabled boolean not null default false,
  daily_limit integer not null default 3 check (daily_limit between 0 and 20),
  updated_at timestamptz not null default statement_timestamp()
);
insert into app_private.ai_news_settings (id) values (true);

create table app_private.ai_news_source_permissions (
  outlet text primary key,
  origin text not null unique check (origin ~ '^https://[^/[:space:]]+$'),
  ai_processing_approved boolean not null default false,
  auto_publication_approved boolean not null default false
);
insert into app_private.ai_news_source_permissions (outlet, origin)
values ('ElBotola', 'https://www.elbotola.com');

create table app_private.ai_news_drafts (
  candidate_key text primary key check (candidate_key ~ '^[a-f0-9]{64}$'),
  source_id text not null unique,
  story_id uuid not null unique references app.stories(id) on delete restrict,
  edition_id uuid not null unique references app.article_editions(id) on delete restrict,
  source_url text not null unique,
  source_title text not null,
  source_outlet text not null,
  source_published_at timestamptz not null,
  source_retrieved_at timestamptz not null,
  facts jsonb not null check (jsonb_typeof(facts) = 'array' and jsonb_array_length(facts) >= 2 and pg_column_size(facts) <= 16000),
  model_provider text not null,
  model_name text not null,
  prompt_version text not null,
  quality_status text not null check (quality_status in ('passed', 'review_required')),
  review_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(review_reasons) = 'array'),
  generated_at timestamptz not null default statement_timestamp(),
  published_at timestamptz
);
create index ai_news_drafts_generated_idx on app_private.ai_news_drafts (generated_at desc);
alter table app_private.ai_news_settings enable row level security;
alter table app_private.ai_news_settings force row level security;
alter table app_private.ai_news_source_permissions enable row level security;
alter table app_private.ai_news_source_permissions force row level security;
alter table app_private.ai_news_drafts enable row level security;
alter table app_private.ai_news_drafts force row level security;
revoke all on app_private.ai_news_settings, app_private.ai_news_source_permissions,
  app_private.ai_news_drafts from public, anon, authenticated, service_role;

create function api.ai_news_configuration()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare settings app_private.ai_news_settings%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'ai_news_service_required'; end if;
  select * into settings from app_private.ai_news_settings where id = true;
  return jsonb_build_object('draftEnabled', settings.draft_enabled,
    'sourceProcessingApproved', settings.source_processing_approved,
    'autoPublishEnabled', settings.auto_publish_enabled, 'dailyLimit', settings.daily_limit);
end;
$$;

create function api.ai_news_existing()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'ai_news_service_required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'sourceId', coalesce(ai.source_id, ''), 'url', coalesce(ai.source_url, story.canonical_url, ''),
    'title', coalesce(ai.source_title, edition.title),
    'publishedAt', coalesce(ai.source_published_at, edition.published_at, edition.created_at)))
    from app.article_editions edition
    join app.stories story on story.id = edition.story_id
    left join app_private.ai_news_drafts ai on ai.edition_id = edition.id
    where edition.created_at >= statement_timestamp() - interval '7 days'
      and story.deleted_at is null
      and edition.status <> 'archived'), '[]'::jsonb);
end;
$$;

create function api.ai_news_pending_publication()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare settings app_private.ai_news_settings%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'ai_news_service_required'; end if;
  select * into settings from app_private.ai_news_settings where id = true;
  if not coalesce(settings.draft_enabled, false) or not coalesce(settings.source_processing_approved, false)
    or not coalesce(settings.auto_publish_enabled, false) or settings.daily_limit = 0 then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(candidate_key order by generated_at) from (
    select draft.candidate_key, draft.generated_at
    from app_private.ai_news_drafts draft
    join app.article_editions edition on edition.id = draft.edition_id
    where draft.published_at is null and draft.quality_status = 'passed'
      and edition.status = 'draft' and edition.visibility = 'private'
      and (select count(distinct fact->>'outlet') from jsonb_array_elements(draft.facts) fact
        join app_private.ai_news_source_permissions permission
          on permission.outlet = fact->>'outlet' and permission.auto_publication_approved
        where position('href="' || (fact->>'sourceUrl') || '"' in edition.body_html) > 0) >= 2
    order by draft.generated_at
    limit greatest(0, settings.daily_limit - (select count(*) from app_private.ai_news_drafts
      where published_at at time zone 'UTC' >= date_trunc('day', statement_timestamp() at time zone 'UTC')))
  ) pending),
    '[]'::jsonb);
end;
$$;

create function api.ai_news_save_draft(p_key text, p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  settings app_private.ai_news_settings%rowtype;
  source jsonb := p_payload->'candidate';
  article jsonb := p_payload->'article';
  existing app_private.ai_news_drafts%rowtype;
  new_story uuid;
  new_edition uuid;
  selected_language app.language_code;
  source_url text;
  v_source_id text;
  title text;
  body_html text;
  slug text;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'ai_news_service_required'; end if;
  select * into settings from app_private.ai_news_settings where id = true;
  if not coalesce(settings.draft_enabled, false) or not coalesce(settings.source_processing_approved, false) then
    raise exception using errcode = '42501', message = 'ai_news_disabled';
  end if;
  if p_key !~ '^[a-f0-9]{64}$' then raise exception using errcode = '22023', message = 'ai_news_invalid_key'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key, 0));
  select * into existing from app_private.ai_news_drafts where candidate_key = p_key;
  if found then return jsonb_build_object('created', false, 'articleId', existing.edition_id); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-news-daily-limit', 0));
  if (select count(*) from app_private.ai_news_drafts
      where generated_at at time zone 'UTC' >= date_trunc('day', statement_timestamp() at time zone 'UTC'))
      >= settings.daily_limit then
    raise exception using errcode = '22023', message = 'ai_news_daily_limit_reached';
  end if;
  selected_language := app_private.news_language(source->>'language');
  source_url := source->>'url';
  v_source_id := source->>'sourceId';
  title := article->>'headline';
  body_html := p_payload->>'html';
  slug := 'ai-' || left(p_key, 32);
  if source->>'competition' <> 'botola-pro-inwi'
    or source->>'outlet' <> 'ElBotola'
    or v_source_id !~ '^elbotola:[0-9]+$'
    or source_url !~ '^https://www[.]elbotola[.]com/article/[0-9-]+[.]html$'
    or jsonb_typeof(source->'facts') <> 'array'
    or jsonb_array_length(source->'facts') < 2
    or exists (select 1 from jsonb_array_elements(source->'facts') fact
      where coalesce(fact->>'id', '') = '' or coalesce(fact->>'text', '') = ''
        or coalesce(fact->>'outlet', '') = ''
        or fact->>'sourceUrl' !~ '^https://[^[:space:]]+$')
    or exists (select 1 from jsonb_array_elements(source->'facts') fact
      where not exists (select 1 from app_private.ai_news_source_permissions permission
        where permission.outlet = fact->>'outlet' and permission.ai_processing_approved
          and left(fact->>'sourceUrl', char_length(permission.origin) + 1) = permission.origin || '/'))
    or (source->>'publishedAt')::timestamptz > statement_timestamp() + interval '5 minutes'
    or (source->>'retrievedAt')::timestamptz < (source->>'publishedAt')::timestamptz
    or p_payload->>'quality' not in ('passed', 'review_required')
    or jsonb_typeof(p_payload->'reasons') <> 'array'
    or p_payload->>'sanitizerVersion' <> 'sanitize-html@2.17.5'
    or p_payload->>'promptVersion' <> 'ai-news-v1'
    or p_payload->>'modelProvider' not in ('openai', 'anthropic')
    or char_length(coalesce(body_html, '')) < 100
    or body_html ~* '<[[:space:]]*(script|iframe|object|embed|style|form|input|button|textarea|select|meta|link)([[:space:]>])'
    or body_html ~* 'on[a-z]+[[:space:]]*='
    or body_html ~* '(javascript|data[[:space:]]*:[[:space:]]*text/html)[[:space:]]*:'
    or position(source_url in body_html) = 0
    or char_length(coalesce(title, '')) < 12
    or char_length(coalesce(article->>'excerpt', '')) < 20
  then raise exception using errcode = '22023', message = 'ai_news_invalid_draft'; end if;
  if exists (select 1 from app_private.ai_news_drafts ai where ai.source_id = v_source_id) then
    raise exception using errcode = '23505', message = 'ai_news_source_collision';
  end if;
  insert into app.stories (origin, original_language, canonical_url)
  values ('manual', selected_language, null) returning id into new_story;
  insert into app.article_editions (
    story_id, language, slug, title, summary, body_format, body_source,
    body_html, status, visibility, reading_time_minutes, seo_title,
    seo_description, sanitizer_version, source_updated_at
  ) values (
    new_story, selected_language, slug, title, article->>'excerpt', 'rich_text', null,
    body_html, 'draft', 'private', least(180, greatest(1, cardinality(regexp_split_to_array(body_html, '[[:space:]]+')) / 220 + 1)),
    article->>'seoTitle', article->>'seoDescription', p_payload->>'sanitizerVersion',
    (source->>'publishedAt')::timestamptz
  ) returning id into new_edition;
  insert into app_private.ai_news_drafts (
    candidate_key, source_id, story_id, edition_id, source_url, source_title, source_outlet,
    source_published_at, source_retrieved_at, facts, model_provider, model_name,
    prompt_version, quality_status, review_reasons
  ) values (
    p_key, v_source_id, new_story, new_edition, source_url, source->>'title', source->>'outlet',
    (source->>'publishedAt')::timestamptz, (source->>'retrievedAt')::timestamptz,
    source->'facts', p_payload->>'modelProvider', p_payload->>'modelName',
    p_payload->>'promptVersion', p_payload->>'quality', p_payload->'reasons'
  );
  perform app_private.write_editorial_audit('ai_article_draft_created', new_story, new_edition,
    jsonb_build_object('candidateKey', p_key, 'sourceId', v_source_id,
      'model', p_payload->>'modelName', 'promptVersion', p_payload->>'promptVersion'));
  return jsonb_build_object('created', true, 'articleId', new_edition);
end;
$$;

create function api.ai_news_publish(p_key text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare settings app_private.ai_news_settings%rowtype; draft app_private.ai_news_drafts%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'ai_news_service_required'; end if;
  select * into settings from app_private.ai_news_settings where id = true;
  if not coalesce(settings.draft_enabled, false) or not coalesce(settings.source_processing_approved, false)
    or not coalesce(settings.auto_publish_enabled, false) then
    raise exception using errcode = '42501', message = 'ai_news_auto_publish_disabled';
  end if;
  select * into draft from app_private.ai_news_drafts where candidate_key = p_key for update;
  if not found then raise exception using errcode = 'P0002', message = 'ai_news_draft_missing'; end if;
  if draft.published_at is not null then return jsonb_build_object('published', false, 'articleId', draft.edition_id); end if;
  if draft.quality_status <> 'passed' or
    (select count(distinct fact->>'outlet') from jsonb_array_elements(draft.facts) fact
      join app_private.ai_news_source_permissions permission
        on permission.outlet = fact->>'outlet' and permission.auto_publication_approved
      join app.article_editions edition on edition.id = draft.edition_id
      where position('href="' || (fact->>'sourceUrl') || '"' in edition.body_html) > 0) < 2 then
    raise exception using errcode = '22023', message = 'ai_news_independent_sources_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-news-daily-publish', 0));
  if (select count(*) from app_private.ai_news_drafts
      where published_at at time zone 'UTC' >= date_trunc('day', statement_timestamp() at time zone 'UTC'))
      >= settings.daily_limit then
    raise exception using errcode = '22023', message = 'ai_news_daily_publication_limit_reached';
  end if;
  update app.article_editions set status = 'published', visibility = 'public',
    published_at = statement_timestamp(), scheduled_at = null
  where id = draft.edition_id and status = 'draft' and visibility = 'private'
    and app_private.news_story_is_publishable(story_id);
  if not found then raise exception using errcode = '22023', message = 'ai_news_not_publishable'; end if;
  update app_private.ai_news_drafts set published_at = statement_timestamp() where candidate_key = p_key;
  perform app_private.write_editorial_audit('ai_article_published', draft.story_id, draft.edition_id,
    jsonb_build_object('candidateKey', p_key));
  return jsonb_build_object('published', true, 'articleId', draft.edition_id);
end;
$$;

revoke all on function api.ai_news_configuration(), api.ai_news_existing(), api.ai_news_pending_publication(),
  api.ai_news_save_draft(text, jsonb), api.ai_news_publish(text)
from public, anon, authenticated, service_role;
grant execute on function api.ai_news_configuration(), api.ai_news_existing(), api.ai_news_pending_publication(),
  api.ai_news_save_draft(text, jsonb), api.ai_news_publish(text) to service_role;
