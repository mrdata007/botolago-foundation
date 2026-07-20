-- BotolaGO Production V2
-- Phase 4A: canonical News and Editorial catalog.
--
-- Stories are language-neutral identities. Article editions are localized
-- publications. Browser roles never write canonical editorial data directly.

create extension if not exists unaccent with schema extensions;

alter type app.media_kind add value if not exists 'article_hero';
alter type app.media_kind add value if not exists 'article_inline';
alter type app.media_kind add value if not exists 'author_avatar';
alter type app.media_kind add value if not exists 'publisher_logo';
alter type app.media_kind add value if not exists 'video_thumbnail';

alter table app.media_assets
  add column width integer,
  add column height integer,
  add column mime_type text,
  add column alt_text text,
  add column caption text,
  add column credit text,
  add column copyright_owner text,
  add column license_url text,
  add column attribution_url text;

alter table app.media_assets drop constraint media_assets_storage_path_check;
alter table app.media_assets add constraint media_assets_storage_path_check check (
  storage_path is null
  or storage_path ~ '^(football|news)/[a-z0-9/_-]+[.](avif|jpg|jpeg|png|webp)$'
);
alter table app.media_assets add constraint media_assets_dimensions_check check (
  (width is null and height is null) or (width between 1 and 12000 and height between 1 and 12000)
);
alter table app.media_assets add constraint media_assets_mime_check check (
  mime_type is null or mime_type in ('image/avif', 'image/jpeg', 'image/png', 'image/webp')
);
alter table app.media_assets add constraint media_assets_license_urls_check check (
  (license_url is null or license_url ~ '^https://[^[:space:]]+$')
  and (attribution_url is null or attribution_url ~ '^https://[^[:space:]]+$')
);

comment on table app.media_assets is
  'Trusted Football and Editorial media references. Only trusted server/editorial workflows may create assets.';

create type app.content_origin as enum ('manual', 'provider', 'partner');
create type app.article_body_format as enum ('markdown', 'rich_text');
create type app.publication_status as enum (
  'draft', 'in_review', 'scheduled', 'published', 'unpublished', 'archived', 'rejected'
);
create type app.article_visibility as enum ('public', 'unlisted', 'private');
create type app.author_type as enum ('staff', 'guest', 'agency', 'automated');
create type app.publisher_source_type as enum ('internal', 'provider', 'partner');
create type app.publisher_trust_status as enum ('trusted', 'review_required', 'blocked');
create type app.publisher_ingestion_mode as enum ('manual', 'api', 'rss');
create type app.taxonomy_type as enum ('category', 'topic', 'tag');
create type app.placement_type as enum (
  'home_lead', 'news_lead', 'editors_pick', 'featured', 'breaking', 'trending'
);
create type app.placement_scope as enum ('global', 'competition', 'team', 'country');

create table app.authors (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  display_name text not null,
  author_type app.author_type not null default 'staff',
  biography text,
  avatar_asset_id uuid references app.media_assets(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint authors_slug_key unique (slug),
  constraint authors_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint authors_display_name_check check (
    display_name = btrim(display_name) and char_length(display_name) between 2 and 120
  ),
  constraint authors_biography_check check (biography is null or char_length(biography) <= 2000)
);

create table app.publishers (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  source_type app.publisher_source_type not null,
  trust_status app.publisher_trust_status not null default 'review_required',
  ingestion_mode app.publisher_ingestion_mode not null default 'manual',
  website_url text,
  logo_asset_id uuid references app.media_assets(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint publishers_slug_key unique (slug),
  constraint publishers_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint publishers_name_check check (name = btrim(name) and char_length(name) between 2 and 160),
  constraint publishers_website_url_check check (
    website_url is null
    or (
      website_url ~ '^https://[^[:space:]]+$'
      and website_url !~* '(access[_-]?token|api[_-]?key|signature|credential)='
    )
  )
);

create table app.taxonomies (
  id uuid primary key default gen_random_uuid(),
  taxonomy_type app.taxonomy_type not null,
  slug text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint taxonomies_type_slug_key unique (taxonomy_type, slug),
  constraint taxonomies_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint taxonomies_display_order_check check (display_order between 0 and 100000)
);

create table app.taxonomy_translations (
  taxonomy_id uuid not null references app.taxonomies(id) on delete cascade,
  language app.language_code not null,
  display_name text not null,
  description text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint taxonomy_translations_pkey primary key (taxonomy_id, language),
  constraint taxonomy_translations_name_check check (
    display_name = btrim(display_name) and char_length(display_name) between 1 and 120
  ),
  constraint taxonomy_translations_description_check check (
    description is null or char_length(description) <= 500
  )
);

create table app.stories (
  id uuid primary key default gen_random_uuid(),
  origin app.content_origin not null default 'manual',
  original_language app.language_code not null,
  author_id uuid references app.authors(id) on delete set null,
  publisher_id uuid references app.publishers(id) on delete restrict,
  canonical_url text,
  content_fingerprint text,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint stories_canonical_url_key unique (canonical_url),
  constraint stories_content_fingerprint_key unique (content_fingerprint),
  constraint stories_canonical_url_check check (
    canonical_url is null
    or (
      canonical_url ~ '^https://[^[:space:]]+$'
      and canonical_url !~* '(access[_-]?token|api[_-]?key|signature|credential)='
    )
  ),
  constraint stories_fingerprint_check check (
    content_fingerprint is null or content_fingerprint ~ '^[a-f0-9]{64}$'
  )
);

create table app.article_editions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references app.stories(id) on delete restrict,
  language app.language_code not null,
  slug text not null,
  title text not null,
  subtitle text,
  summary text not null,
  body_format app.article_body_format not null default 'markdown',
  body_source text,
  body_html text not null,
  hero_asset_id uuid references app.media_assets(id) on delete set null,
  status app.publication_status not null default 'draft',
  visibility app.article_visibility not null default 'private',
  scheduled_at timestamptz,
  published_at timestamptz,
  unpublished_at timestamptz,
  reading_time_minutes smallint not null,
  seo_title text,
  seo_description text,
  sanitizer_version text not null,
  source_updated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint article_editions_story_language_key unique (story_id, language),
  constraint article_editions_language_slug_key unique (language, slug),
  constraint article_editions_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint article_editions_title_check check (
    title = btrim(title) and char_length(title) between 5 and 220
  ),
  constraint article_editions_subtitle_check check (
    subtitle is null or (subtitle = btrim(subtitle) and char_length(subtitle) between 2 and 300)
  ),
  constraint article_editions_summary_check check (
    summary = btrim(summary) and char_length(summary) between 10 and 1000
  ),
  constraint article_editions_body_source_check check (
    (body_format = 'markdown' and body_source is not null and char_length(body_source) >= 20)
    or (body_format = 'rich_text' and body_source is null)
  ),
  constraint article_editions_body_html_check check (
    char_length(body_html) >= 20
    and body_html !~* '<[[:space:]]*(script|iframe|object|embed|style|form|input|button|textarea|select|meta|link)([[:space:]>])'
    and body_html !~* 'on[a-z]+[[:space:]]*='
    and body_html !~* '(javascript|data[[:space:]]*:[[:space:]]*text/html)[[:space:]]*:'
  ),
  constraint article_editions_reading_time_check check (reading_time_minutes between 1 and 180),
  constraint article_editions_seo_title_check check (seo_title is null or char_length(seo_title) <= 70),
  constraint article_editions_seo_description_check check (
    seo_description is null or char_length(seo_description) <= 170
  ),
  constraint article_editions_sanitizer_version_check check (
    sanitizer_version = btrim(sanitizer_version) and char_length(sanitizer_version) between 1 and 40
  ),
  constraint article_editions_schedule_check check (
    (status = 'scheduled' and scheduled_at is not null and visibility <> 'private')
    or status <> 'scheduled'
  ),
  constraint article_editions_publish_check check (
    (status = 'published' and published_at is not null and visibility <> 'private')
    or status <> 'published'
  ),
  constraint article_editions_unpublish_check check (
    (status in ('unpublished', 'archived') and unpublished_at is not null)
    or status not in ('unpublished', 'archived')
  )
);

create table app.story_taxonomies (
  story_id uuid not null references app.stories(id) on delete cascade,
  taxonomy_id uuid not null references app.taxonomies(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  constraint story_taxonomies_pkey primary key (story_id, taxonomy_id)
);

create unique index story_taxonomies_one_primary_category_key
  on app.story_taxonomies (story_id)
  where is_primary;
create index story_taxonomies_taxonomy_story_idx on app.story_taxonomies (taxonomy_id, story_id);

create table app.story_competitions (
  story_id uuid not null references app.stories(id) on delete cascade,
  competition_id uuid not null references app.competitions(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  constraint story_competitions_pkey primary key (story_id, competition_id)
);
create index story_competitions_competition_story_idx
  on app.story_competitions (competition_id, story_id);

create table app.story_teams (
  story_id uuid not null references app.stories(id) on delete cascade,
  team_id uuid not null references app.teams(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  constraint story_teams_pkey primary key (story_id, team_id)
);
create index story_teams_team_story_idx on app.story_teams (team_id, story_id);

create table app.story_players (
  story_id uuid not null references app.stories(id) on delete cascade,
  player_id uuid not null references app.players(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  constraint story_players_pkey primary key (story_id, player_id)
);
create index story_players_player_story_idx on app.story_players (player_id, story_id);

create table app.story_countries (
  story_id uuid not null references app.stories(id) on delete cascade,
  country_id uuid not null references app.countries(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  constraint story_countries_pkey primary key (story_id, country_id)
);
create index story_countries_country_story_idx on app.story_countries (country_id, story_id);

create table app.article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_edition_id uuid not null references app.article_editions(id) on delete restrict,
  revision_number integer not null,
  title text not null,
  subtitle text,
  summary text not null,
  body_source text,
  body_html text not null,
  status app.publication_status not null,
  visibility app.article_visibility not null,
  changed_by uuid references auth.users(id) on delete set null,
  change_reason text,
  created_at timestamptz not null default statement_timestamp(),
  constraint article_revisions_edition_number_key unique (article_edition_id, revision_number),
  constraint article_revisions_number_check check (revision_number > 0),
  constraint article_revisions_reason_check check (
    change_reason is null or char_length(change_reason) between 3 and 500
  )
);
create index article_revisions_edition_created_idx
  on app.article_revisions (article_edition_id, created_at desc, id desc);

create table app.editorial_placements (
  id uuid primary key default gen_random_uuid(),
  article_edition_id uuid not null references app.article_editions(id) on delete cascade,
  placement_type app.placement_type not null,
  language app.language_code not null,
  scope_type app.placement_scope not null default 'global',
  scope_id uuid,
  priority smallint not null default 100,
  starts_at timestamptz not null default statement_timestamp(),
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint editorial_placements_scope_check check (
    (scope_type = 'global' and scope_id is null)
    or (scope_type <> 'global' and scope_id is not null)
  ),
  constraint editorial_placements_priority_check check (priority between 1 and 1000),
  constraint editorial_placements_time_check check (ends_at is null or ends_at > starts_at),
  constraint editorial_placements_identity_key unique (
    article_edition_id, placement_type, language, scope_type, scope_id, starts_at
  )
);
create index editorial_placements_active_idx
  on app.editorial_placements (language, placement_type, priority, starts_at desc, id)
  where ends_at is null;
create index editorial_placements_scope_idx
  on app.editorial_placements (scope_type, scope_id, language, starts_at desc, id);

create table app.saved_articles (
  user_id uuid not null references auth.users(id) on delete cascade,
  article_edition_id uuid not null references app.article_editions(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  constraint saved_articles_pkey primary key (user_id, article_edition_id)
);
create index saved_articles_user_created_idx
  on app.saved_articles (user_id, created_at desc, article_edition_id desc);
create index saved_articles_edition_user_idx
  on app.saved_articles (article_edition_id, user_id);

create or replace function app_private.validate_article_taxonomy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  kind app.taxonomy_type;
begin
  select taxonomy_type into kind from app.taxonomies where id = new.taxonomy_id;
  if new.is_primary and kind <> 'category' then
    raise exception using errcode = '23514', message = 'news_primary_taxonomy_must_be_category';
  end if;
  return new;
end;
$$;

create or replace function app_private.validate_editorial_placement()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  edition_language app.language_code;
begin
  select language into edition_language from app.article_editions where id = new.article_edition_id;
  if edition_language is distinct from new.language then
    raise exception using errcode = '23514', message = 'news_placement_language_mismatch';
  end if;
  if new.scope_type = 'competition' and not exists (select 1 from app.competitions where id = new.scope_id) then
    raise exception using errcode = '23503', message = 'news_placement_scope_not_found';
  elsif new.scope_type = 'team' and not exists (select 1 from app.teams where id = new.scope_id) then
    raise exception using errcode = '23503', message = 'news_placement_scope_not_found';
  elsif new.scope_type = 'country' and not exists (select 1 from app.countries where id = new.scope_id) then
    raise exception using errcode = '23503', message = 'news_placement_scope_not_found';
  end if;
  if new.placement_type in ('home_lead', 'news_lead') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      concat_ws(':', new.placement_type::text, new.language::text, new.scope_type::text,
        coalesce(new.scope_id::text, 'global')), 0
    ));
    if exists (
      select 1 from app.editorial_placements existing
      where existing.id <> new.id
        and existing.placement_type = new.placement_type
        and existing.language = new.language
        and existing.scope_type = new.scope_type
        and existing.scope_id is not distinct from new.scope_id
        and tstzrange(existing.starts_at, coalesce(existing.ends_at, 'infinity'::timestamptz), '[)')
          && tstzrange(new.starts_at, coalesce(new.ends_at, 'infinity'::timestamptz), '[)')
    ) then
      raise exception using errcode = '23P01', message = 'news_placement_window_conflict';
    end if;
  end if;
  return new;
end;
$$;

create or replace function app_private.capture_article_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_revision integer;
begin
  if row(old.title, old.subtitle, old.summary, old.body_source, old.body_html, old.status, old.visibility)
     is not distinct from
     row(new.title, new.subtitle, new.summary, new.body_source, new.body_html, new.status, new.visibility) then
    return new;
  end if;

  select coalesce(max(revision_number), 0) + 1 into next_revision
  from app.article_revisions where article_edition_id = old.id;

  insert into app.article_revisions (
    article_edition_id, revision_number, title, subtitle, summary, body_source,
    body_html, status, visibility, changed_by
  ) values (
    old.id, next_revision, old.title, old.subtitle, old.summary, old.body_source,
    old.body_html, old.status, old.visibility, coalesce(new.updated_by, auth.uid())
  );
  return new;
end;
$$;

create trigger story_taxonomies_validate_before_write
before insert or update on app.story_taxonomies
for each row execute function app_private.validate_article_taxonomy();
create trigger editorial_placements_validate_before_write
before insert or update on app.editorial_placements
for each row execute function app_private.validate_editorial_placement();
create trigger article_editions_capture_revision_before_update
before update on app.article_editions
for each row execute function app_private.capture_article_revision();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'authors', 'publishers', 'taxonomies', 'taxonomy_translations',
    'stories', 'article_editions', 'editorial_placements'
  ] loop
    execute format(
      'create trigger %I before update on app.%I for each row execute function app_private.set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
  end loop;
end;
$$;

alter table app.authors enable row level security;
alter table app.authors force row level security;
alter table app.publishers enable row level security;
alter table app.publishers force row level security;
alter table app.taxonomies enable row level security;
alter table app.taxonomies force row level security;
alter table app.taxonomy_translations enable row level security;
alter table app.taxonomy_translations force row level security;
alter table app.stories enable row level security;
alter table app.stories force row level security;
alter table app.article_editions enable row level security;
alter table app.article_editions force row level security;
alter table app.story_taxonomies enable row level security;
alter table app.story_taxonomies force row level security;
alter table app.story_competitions enable row level security;
alter table app.story_competitions force row level security;
alter table app.story_teams enable row level security;
alter table app.story_teams force row level security;
alter table app.story_players enable row level security;
alter table app.story_players force row level security;
alter table app.story_countries enable row level security;
alter table app.story_countries force row level security;
alter table app.article_revisions enable row level security;
alter table app.article_revisions force row level security;
alter table app.editorial_placements enable row level security;
alter table app.editorial_placements force row level security;
alter table app.saved_articles enable row level security;
alter table app.saved_articles force row level security;

revoke all on table app.authors, app.publishers, app.taxonomies,
  app.taxonomy_translations, app.stories, app.article_editions,
  app.story_taxonomies, app.story_competitions, app.story_teams,
  app.story_players, app.story_countries, app.article_revisions,
  app.editorial_placements, app.saved_articles
from public, anon, authenticated, service_role;

create policy saved_articles_select_own on app.saved_articles
for select to authenticated
using (user_id = (select auth.uid()));
create policy saved_articles_insert_own on app.saved_articles
for insert to authenticated
with check (user_id = (select auth.uid()));
create policy saved_articles_delete_own on app.saved_articles
for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on function app_private.validate_article_taxonomy(),
  app_private.validate_editorial_placement(), app_private.capture_article_revision()
from public, anon, authenticated, service_role;
grant execute on function app_private.validate_article_taxonomy(),
  app_private.validate_editorial_placement(), app_private.capture_article_revision()
to postgres;

comment on table app.stories is
  'Language-neutral identity and deduplication boundary for editorial content.';
comment on table app.article_editions is
  'One localized publication per story and language; body_html must already be sanitized.';
comment on table app.article_revisions is
  'Append-only snapshots captured before material article edits.';
comment on table app.saved_articles is
  'Authenticated-user ownership relation. Mutations are exposed through idempotent api RPCs.';
