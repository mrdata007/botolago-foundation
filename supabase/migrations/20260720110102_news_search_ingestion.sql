-- BotolaGO Production V2
-- Phase 4B: derived search, editorial authority, provider identity, and
-- observable ingestion state. Provider payloads are never stored verbatim.

create type app_private.editorial_role as enum ('editor', 'publisher', 'admin');
create type app_private.news_ingestion_status as enum (
  'pending', 'running', 'succeeded', 'partially_succeeded', 'failed', 'cancelled'
);
create type app_private.news_dedupe_decision as enum (
  'new_story', 'external_id_match', 'canonical_url_match', 'fingerprint_match',
  'manual_merge', 'manual_separate', 'rejected_collision'
);
create type app_private.news_rejection_reason as enum (
  'invalid_payload', 'mapping_collision', 'duplicate_conflict', 'unsafe_content',
  'unsupported_language', 'stale_update', 'source_blocked', 'rate_limited', 'provider_unavailable'
);

create table app_private.editorial_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role app_private.editorial_role not null,
  active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table app.article_search_documents (
  article_edition_id uuid primary key references app.article_editions(id) on delete cascade,
  language app.language_code not null,
  story_id uuid not null references app.stories(id) on delete cascade,
  published_at timestamptz,
  search_vector tsvector not null,
  refreshed_at timestamptz not null default statement_timestamp()
);

create index article_search_documents_vector_idx
  on app.article_search_documents using gin (search_vector);
create index article_search_documents_language_published_idx
  on app.article_search_documents (language, published_at desc, article_edition_id desc);
create index article_search_documents_story_idx
  on app.article_search_documents (story_id, article_edition_id);

create table app_private.news_source_articles (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references app.publishers(id) on delete restrict,
  external_id text not null,
  story_id uuid not null references app.stories(id) on delete restrict,
  article_edition_id uuid not null references app.article_editions(id) on delete restrict,
  canonical_url text,
  content_fingerprint text not null,
  source_version text,
  source_published_at timestamptz,
  source_updated_at timestamptz not null,
  last_seen_at timestamptz not null default statement_timestamp(),
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint news_source_articles_publisher_external_key unique (publisher_id, external_id),
  constraint news_source_articles_fingerprint_check check (content_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint news_source_articles_external_id_check check (
    external_id = btrim(external_id) and char_length(external_id) between 1 and 250
  ),
  constraint news_source_articles_canonical_url_check check (
    canonical_url is null
    or (
      canonical_url ~ '^https://[^[:space:]]+$'
      and canonical_url !~* '(access[_-]?token|api[_-]?key|signature|credential)='
    )
  )
);
create index news_source_articles_story_idx
  on app_private.news_source_articles (story_id, publisher_id, external_id);
create index news_source_articles_fingerprint_idx
  on app_private.news_source_articles (publisher_id, content_fingerprint, source_updated_at desc);
create index news_source_articles_last_seen_idx
  on app_private.news_source_articles (publisher_id, last_seen_at desc, id);

create table app_private.news_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references app.publishers(id) on delete restrict,
  job_type text not null,
  target_scope text not null default 'all',
  status app_private.news_ingestion_status not null default 'pending',
  cursor_value text,
  started_at timestamptz,
  completed_at timestamptz,
  records_fetched integer not null default 0,
  records_validated integer not null default 0,
  records_inserted integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  records_rejected integer not null default 0,
  retry_count integer not null default 0,
  error_code text,
  error_summary text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint news_ingestion_runs_job_check check (job_type ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint news_ingestion_runs_scope_check check (
    target_scope = btrim(target_scope) and char_length(target_scope) between 1 and 250
  ),
  constraint news_ingestion_runs_counts_check check (
    records_fetched >= 0 and records_validated >= 0 and records_inserted >= 0
    and records_updated >= 0 and records_skipped >= 0 and records_rejected >= 0 and retry_count >= 0
  ),
  constraint news_ingestion_runs_time_check check (
    completed_at is null or started_at is null or completed_at >= started_at
  ),
  constraint news_ingestion_runs_error_check check (
    error_summary is null or char_length(error_summary) <= 1000
  )
);
create index news_ingestion_runs_operations_idx
  on app_private.news_ingestion_runs (status, created_at desc, id);
create index news_ingestion_runs_publisher_job_idx
  on app_private.news_ingestion_runs (publisher_id, job_type, created_at desc, id);

create table app_private.news_ingestion_rejections (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references app_private.news_ingestion_runs(id) on delete cascade,
  external_id text,
  reason app_private.news_rejection_reason not null,
  error_code text not null,
  sanitized_summary text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint news_ingestion_rejections_summary_check check (
    sanitized_summary = btrim(sanitized_summary) and char_length(sanitized_summary) between 1 and 1000
  )
);
create index news_ingestion_rejections_run_idx
  on app_private.news_ingestion_rejections (run_id, created_at, id);

create table app_private.news_duplicate_decisions (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references app.publishers(id) on delete restrict,
  external_id text,
  candidate_story_id uuid references app.stories(id) on delete restrict,
  matched_story_id uuid references app.stories(id) on delete restrict,
  decision app_private.news_dedupe_decision not null,
  evidence_code text not null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default statement_timestamp(),
  constraint news_duplicate_decisions_evidence_check check (
    evidence_code ~ '^[a-z][a-z0-9_]{2,79}$'
  )
);
create index news_duplicate_decisions_source_idx
  on app_private.news_duplicate_decisions (publisher_id, external_id, decided_at desc, id);

create table app_private.editorial_audit_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  story_id uuid references app.stories(id) on delete set null,
  article_edition_id uuid references app.article_editions(id) on delete set null,
  correlation_id uuid not null default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint editorial_audit_events_type_check check (event_type ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint editorial_audit_events_metadata_check check (
    jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096
  )
);
create index editorial_audit_events_target_idx
  on app_private.editorial_audit_events (article_edition_id, occurred_at desc, id desc);
create index editorial_audit_events_actor_idx
  on app_private.editorial_audit_events (actor_user_id, occurred_at desc, id desc);

create or replace function app_private.normalize_news_text(value text, language app.language_code)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when language = 'ar' then
      regexp_replace(
        translate(lower(value), 'أإآٱىؤئـ', 'اااايءء '),
        '[ًٌٍَُِّْـ]+', '', 'g'
      )
    else lower(value)
  end
$$;

create or replace function app_private.refresh_article_search(p_article_edition_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  edition app.article_editions%rowtype;
  related_text text;
  search_config regconfig;
begin
  select * into edition from app.article_editions where id = p_article_edition_id;
  if not found then
    delete from app.article_search_documents where article_edition_id = p_article_edition_id;
    return;
  end if;

  select concat_ws(' ',
    (select display_name from app.authors where id = (select author_id from app.stories where id = edition.story_id)),
    (select name from app.publishers where id = (select publisher_id from app.stories where id = edition.story_id)),
    (select string_agg(coalesce(tt.display_name, t.slug), ' ')
       from app.story_taxonomies st
       join app.taxonomies t on t.id = st.taxonomy_id
       left join app.taxonomy_translations tt
         on tt.taxonomy_id = t.id and tt.language = edition.language
      where st.story_id = edition.story_id),
    (select string_agg(c.name, ' ') from app.story_competitions sc
       join app.competitions c on c.id = sc.competition_id where sc.story_id = edition.story_id),
    (select string_agg(t.name, ' ') from app.story_teams st
       join app.teams t on t.id = st.team_id where st.story_id = edition.story_id),
    (select string_agg(p.full_name, ' ') from app.story_players sp
       join app.players p on p.id = sp.player_id where sp.story_id = edition.story_id),
    (select string_agg(coalesce(ct.display_name, c.iso_alpha3), ' ')
       from app.story_countries sc join app.countries c on c.id = sc.country_id
       left join app.country_translations ct
         on ct.country_id = c.id and ct.language = edition.language
      where sc.story_id = edition.story_id)
  ) into related_text;

  search_config := case when edition.language = 'fr' then 'pg_catalog.french'::regconfig
                        else 'pg_catalog.simple'::regconfig end;

  insert into app.article_search_documents (
    article_edition_id, language, story_id, published_at, search_vector, refreshed_at
  ) values (
    edition.id, edition.language, edition.story_id, edition.published_at,
    setweight(to_tsvector(search_config, app_private.normalize_news_text(edition.title, edition.language)), 'A') ||
    setweight(to_tsvector(search_config, app_private.normalize_news_text(edition.summary, edition.language)), 'B') ||
    setweight(to_tsvector(search_config, app_private.normalize_news_text(coalesce(related_text, ''), edition.language)), 'B') ||
    setweight(to_tsvector(search_config, app_private.normalize_news_text(edition.body_html, edition.language)), 'D'),
    statement_timestamp()
  ) on conflict (article_edition_id) do update set
    language = excluded.language,
    story_id = excluded.story_id,
    published_at = excluded.published_at,
    search_vector = excluded.search_vector,
    refreshed_at = excluded.refreshed_at;
end;
$$;

create or replace function app_private.refresh_story_search_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_story_id uuid := case when tg_op = 'DELETE' then old.story_id else new.story_id end;
  edition_id uuid;
begin
  for edition_id in select id from app.article_editions where story_id = target_story_id loop
    perform app_private.refresh_article_search(edition_id);
  end loop;
  return coalesce(new, old);
end;
$$;

create or replace function app_private.refresh_edition_search_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from app.article_search_documents where article_edition_id = old.id;
    return old;
  end if;
  perform app_private.refresh_article_search(new.id);
  return new;
end;
$$;

create or replace function app_private.has_editorial_role(required_role app_private.editorial_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app_private.editorial_memberships
    where user_id = auth.uid()
      and active
      and case required_role
        when 'editor' then role in ('editor', 'publisher', 'admin')
        when 'publisher' then role in ('publisher', 'admin')
        when 'admin' then role = 'admin'
      end
  )
$$;

create or replace function app_private.write_editorial_audit(
  event_name text,
  target_story_id uuid,
  target_article_edition_id uuid,
  safe_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if event_name !~ '^[a-z][a-z0-9_]{2,79}$' or jsonb_typeof(safe_metadata) <> 'object'
     or pg_column_size(safe_metadata) > 4096 then
    raise exception using errcode = '22023', message = 'news_invalid_audit_event';
  end if;
  insert into app_private.editorial_audit_events (
    event_type, actor_user_id, story_id, article_edition_id, metadata
  ) values (event_name, auth.uid(), target_story_id, target_article_edition_id, safe_metadata);
end;
$$;

create trigger article_editions_refresh_search_after_write
after insert or update or delete on app.article_editions
for each row execute function app_private.refresh_edition_search_trigger();
create trigger story_taxonomies_refresh_search_after_write
after insert or update or delete on app.story_taxonomies
for each row execute function app_private.refresh_story_search_trigger();
create trigger story_competitions_refresh_search_after_write
after insert or update or delete on app.story_competitions
for each row execute function app_private.refresh_story_search_trigger();
create trigger story_teams_refresh_search_after_write
after insert or update or delete on app.story_teams
for each row execute function app_private.refresh_story_search_trigger();
create trigger story_players_refresh_search_after_write
after insert or update or delete on app.story_players
for each row execute function app_private.refresh_story_search_trigger();
create trigger story_countries_refresh_search_after_write
after insert or update or delete on app.story_countries
for each row execute function app_private.refresh_story_search_trigger();

create trigger editorial_memberships_set_updated_at before update on app_private.editorial_memberships
for each row execute function app_private.set_updated_at();
create trigger news_source_articles_set_updated_at before update on app_private.news_source_articles
for each row execute function app_private.set_updated_at();
create trigger news_ingestion_runs_set_updated_at before update on app_private.news_ingestion_runs
for each row execute function app_private.set_updated_at();

alter table app.article_search_documents enable row level security;
alter table app.article_search_documents force row level security;
alter table app_private.editorial_memberships enable row level security;
alter table app_private.editorial_memberships force row level security;
alter table app_private.news_source_articles enable row level security;
alter table app_private.news_source_articles force row level security;
alter table app_private.news_ingestion_runs enable row level security;
alter table app_private.news_ingestion_runs force row level security;
alter table app_private.news_ingestion_rejections enable row level security;
alter table app_private.news_ingestion_rejections force row level security;
alter table app_private.news_duplicate_decisions enable row level security;
alter table app_private.news_duplicate_decisions force row level security;
alter table app_private.editorial_audit_events enable row level security;
alter table app_private.editorial_audit_events force row level security;

revoke all on table app.article_search_documents,
  app_private.editorial_memberships, app_private.news_source_articles,
  app_private.news_ingestion_runs, app_private.news_ingestion_rejections,
  app_private.news_duplicate_decisions, app_private.editorial_audit_events
from public, anon, authenticated, service_role;

revoke all on function app_private.normalize_news_text(text, app.language_code),
  app_private.refresh_article_search(uuid), app_private.refresh_story_search_trigger(),
  app_private.refresh_edition_search_trigger(),
  app_private.has_editorial_role(app_private.editorial_role),
  app_private.write_editorial_audit(text, uuid, uuid, jsonb)
from public, anon, authenticated, service_role;
grant execute on function app_private.normalize_news_text(text, app.language_code),
  app_private.refresh_article_search(uuid), app_private.refresh_story_search_trigger(),
  app_private.refresh_edition_search_trigger(),
  app_private.has_editorial_role(app_private.editorial_role),
  app_private.write_editorial_audit(text, uuid, uuid, jsonb)
to postgres;

comment on table app.article_search_documents is
  'Derived weighted FTS document. French uses the French dictionary; Arabic uses normalized simple tokenization.';
comment on table app_private.news_source_articles is
  'Provider identity mapping and freshness boundary. Raw provider payloads are intentionally excluded.';
comment on table app_private.editorial_audit_events is
  'Append-only security and workflow audit log. Retain online for 400 days, then archive by reviewed operations policy.';
