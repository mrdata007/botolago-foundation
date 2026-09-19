-- BG-0012 (Verifier follow-up): server-side trust boundary for body_html.
--
-- The CMS editor sanitized body_html client-side (src/backend/news/sanitizer.ts)
-- before calling api.editorial_create_draft / api.editorial_update_article, but
-- those RPCs stored whatever p_body_html they were given verbatim, still
-- callable directly by any `authenticated` client via PostgREST. A compromised,
-- modified, or direct API client could bypass the browser bundle entirely and
-- submit unsanitized executable HTML, which the public article renderer would
-- then serve as trusted content -- the client-side sanitizer alone is not a
-- trust boundary.
--
-- Fix: neither auth.uid()/has_editorial_role()/RLS/MFA-AAL2 enforcement nor the
-- draft/update lifecycle changes at all here (still callable by `authenticated`,
-- still fully re-checked per call). Instead, both RPCs now additionally require
-- a `p_body_html_mac`: an HMAC-SHA256 (hex) over the exact `p_body_html` bytes,
-- keyed by a secret that only a trusted server component can ever obtain (see
-- api.editorial_write_secret_for_service() below, granted to service_role
-- only -- a browser client can never present a service_role JWT). The
-- news-editorial-write Edge Function is the only holder of that secret: it
-- authenticates the caller, runs the real (JS) sanitize-html allowlist
-- server-side, computes the MAC over the sanitized output, and forwards the
-- call using the *user's own* JWT (preserving every existing authorization
-- check unchanged). A raw call missing a valid MAC for its exact body_html is
-- rejected before any content-specific check even runs, so attacker-supplied
-- HTML can never reach persistence without having first passed through the
-- Edge Function's sanitizer.

create extension if not exists pgcrypto with schema extensions;

create table app_private.news_editorial_write_keys (
  id boolean primary key default true,
  secret bytea not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint news_editorial_write_keys_singleton check (id)
);

alter table app_private.news_editorial_write_keys enable row level security;
alter table app_private.news_editorial_write_keys force row level security;

insert into app_private.news_editorial_write_keys (id, secret)
values (true, extensions.gen_random_bytes(32));

comment on table app_private.news_editorial_write_keys is
  'Single-row HMAC secret used to prove body_html was sanitized by the trusted news-editorial-write Edge Function before being persisted. Never selectable by anon/authenticated/service_role directly -- only readable from inside the SECURITY DEFINER functions below.';

create or replace function app_private.verify_editorial_content_mac(p_body_html text, p_mac text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_mac is null or p_mac !~ '^[0-9a-f]{64}$' then false
    else coalesce(
      (select extensions.hmac(convert_to(p_body_html, 'utf8'), secret, 'sha256')
         from app_private.news_editorial_write_keys where id = true) = decode(p_mac, 'hex'),
      false
    )
  end;
$$;

comment on function app_private.verify_editorial_content_mac(text, text) is
  'Verifies a hex HMAC-SHA256 over body_html against the server-only write secret. Only news-editorial-write, which alone knows the secret, can ever produce a matching MAC.';

create or replace function api.editorial_write_secret_for_service()
returns bytea
language sql
stable
security definer
set search_path = ''
as $$
  select secret from app_private.news_editorial_write_keys where id = true;
$$;

comment on function api.editorial_write_secret_for_service() is
  'Returns the HMAC secret used to prove server-side body_html sanitization. Granted to service_role only -- a browser client can never present a service_role JWT, so it can never learn this value.';

revoke all on function app_private.verify_editorial_content_mac(text, text)
from public, anon, authenticated, service_role;
grant execute on function app_private.verify_editorial_content_mac(text, text) to postgres;

revoke all on function api.editorial_write_secret_for_service()
from public, anon, authenticated;
grant execute on function api.editorial_write_secret_for_service() to service_role;

revoke all on table app_private.news_editorial_write_keys from public, anon, authenticated, service_role;

-- Both write RPCs are dropped and recreated with the added p_body_html_mac
-- parameter (a new parameter changes the function's identity, so a bare
-- `create or replace` would leave the old, unguarded signature callable
-- alongside the new one).

drop function if exists api.editorial_create_draft(
  text, text, text, text, app.article_body_format, text, text, smallint, text, uuid, uuid, uuid
);

create or replace function api.editorial_create_draft(
  p_language text,
  p_slug text,
  p_title text,
  p_summary text,
  p_body_format app.article_body_format,
  p_body_source text,
  p_body_html text,
  p_reading_time_minutes smallint,
  p_sanitizer_version text,
  p_body_html_mac text,
  p_story_id uuid default null,
  p_author_id uuid default null,
  p_publisher_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_language app.language_code := app_private.news_language(p_language);
  target_story_id uuid := p_story_id;
  target_edition_id uuid;
begin
  if not app_private.has_editorial_role('editor') then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  if not app_private.verify_editorial_content_mac(p_body_html, p_body_html_mac) then
    raise exception using errcode = '42501', message = 'news_editorial_content_not_sanitized';
  end if;
  if target_story_id is null then
    insert into app.stories (origin, original_language, author_id, publisher_id, created_by)
    values ('manual', selected_language, p_author_id, p_publisher_id, auth.uid()) returning id into target_story_id;
  elsif not exists (select 1 from app.stories where id = target_story_id and deleted_at is null) then
    raise exception using errcode = 'P0002', message = 'news_story_not_found';
  end if;
  insert into app.article_editions (
    story_id, language, slug, title, summary, body_format, body_source, body_html,
    status, visibility, reading_time_minutes, sanitizer_version, created_by, updated_by
  ) values (
    target_story_id, selected_language, p_slug, p_title, p_summary, p_body_format,
    p_body_source, p_body_html, 'draft', 'private', p_reading_time_minutes,
    p_sanitizer_version, auth.uid(), auth.uid()
  ) returning id into target_edition_id;
  perform app_private.write_editorial_audit(
    'article_draft_created', target_story_id, target_edition_id, jsonb_build_object('language', selected_language)
  );
  return jsonb_build_object('storyId', target_story_id, 'articleId', target_edition_id, 'status', 'draft');
exception when unique_violation then
  raise exception using errcode = '23505', message = 'news_slug_or_translation_conflict';
end;
$$;

drop function if exists api.editorial_update_article(
  uuid, timestamptz, text, text, text, text, app.article_body_format, text, text, smallint, text, uuid, text, text
);

create or replace function api.editorial_update_article(
  p_article_edition_id uuid,
  p_expected_updated_at timestamptz,
  p_slug text,
  p_title text,
  p_subtitle text,
  p_summary text,
  p_body_format app.article_body_format,
  p_body_source text,
  p_body_html text,
  p_reading_time_minutes smallint,
  p_sanitizer_version text,
  p_body_html_mac text,
  p_hero_asset_id uuid default null,
  p_seo_title text default null,
  p_seo_description text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare edition app.article_editions%rowtype;
begin
  if not app_private.has_editorial_role('editor') then
    raise exception using errcode = '42501', message = 'news_editorial_forbidden';
  end if;
  if not app_private.verify_editorial_content_mac(p_body_html, p_body_html_mac) then
    raise exception using errcode = '42501', message = 'news_editorial_content_not_sanitized';
  end if;
  select * into edition from app.article_editions where id = p_article_edition_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'news_article_not_found'; end if;
  if edition.updated_at <> p_expected_updated_at then
    raise exception using errcode = '40001', message = 'news_editorial_conflict';
  end if;
  if edition.status not in ('draft', 'in_review', 'rejected', 'unpublished') then
    raise exception using errcode = '22023', message = 'news_article_not_editable';
  end if;
  update app.article_editions set
    slug = p_slug, title = p_title, subtitle = p_subtitle, summary = p_summary,
    body_format = p_body_format, body_source = p_body_source, body_html = p_body_html,
    reading_time_minutes = p_reading_time_minutes, sanitizer_version = p_sanitizer_version,
    hero_asset_id = p_hero_asset_id, seo_title = p_seo_title,
    seo_description = p_seo_description, updated_by = auth.uid()
  where id = edition.id;
  perform app_private.write_editorial_audit(
    'article_content_updated', edition.story_id, edition.id,
    jsonb_build_object('previousUpdatedAt', edition.updated_at)
  );
  return jsonb_build_object(
    'articleId', edition.id, 'status', edition.status,
    'updatedAt', (select updated_at from app.article_editions where id = edition.id)
  );
exception when unique_violation then
  raise exception using errcode = '23505', message = 'news_slug_or_translation_conflict';
end;
$$;

revoke all on function
  api.editorial_create_draft(text, text, text, text, app.article_body_format, text, text, smallint, text, text, uuid, uuid, uuid),
  api.editorial_update_article(uuid, timestamptz, text, text, text, text, app.article_body_format, text, text, smallint, text, text, uuid, text, text)
from public, anon, authenticated, service_role;

grant execute on function
  api.editorial_create_draft(text, text, text, text, app.article_body_format, text, text, smallint, text, text, uuid, uuid, uuid),
  api.editorial_update_article(uuid, timestamptz, text, text, text, text, app.article_body_format, text, text, smallint, text, text, uuid, text, text)
to authenticated;

comment on function api.editorial_create_draft(text, text, text, text, app.article_body_format, text, text, smallint, text, text, uuid, uuid, uuid) is
  'Creates a draft article edition. p_body_html_mac must be a valid HMAC-SHA256 (hex) over p_body_html produced by the news-editorial-write Edge Function, which is the only caller that can compute it -- see app_private.verify_editorial_content_mac.';

comment on function api.editorial_update_article(uuid, timestamptz, text, text, text, text, app.article_body_format, text, text, smallint, text, text, uuid, text, text) is
  'Updates an editable article edition''s content. p_body_html_mac must be a valid HMAC-SHA256 (hex) over p_body_html produced by the news-editorial-write Edge Function, which is the only caller that can compute it -- see app_private.verify_editorial_content_mac.';
