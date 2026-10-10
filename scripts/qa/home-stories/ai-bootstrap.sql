-- Additional fixtures for the disposable plain-Postgres harness only.
create schema storage; create schema cron;
create table storage.objects(bucket_id text,name text);
create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
create table app.publishers(id uuid primary key,name text);
create table app.stories(id uuid primary key,original_language text,deleted_at timestamptz,publisher_id uuid);
create table app.article_editions(id uuid primary key,story_id uuid,language text,slug text,title text,summary text,body_format text,body_html text check(char_length(body_html)>=20),reading_time_minutes integer,sanitizer_version text,status text,visibility text,published_at timestamptz);
alter table app.media_assets alter column id set default gen_random_uuid();
alter table app.media_assets add column kind text check(kind in ('article_hero','article_inline')),add column validated_at timestamptz,add column width integer,add column height integer,add column alt_text text;
create function app_private.is_service_request() returns boolean language sql as $$select current_setting('request.jwt.claim.role',true)='service_role'$$;
create table app_private.notification_email_settings(id boolean,functions_base_url text);
create function app_private.invoke_scheduled_function(text,text,jsonb) returns bigint language sql as $$select 1::bigint$$;
alter table app.article_editions add constraint fixture_publication_visibility check(status<>'published' or (published_at is not null and visibility<>'private'));

create table app.teams(id uuid primary key,name text);
create table app.fixtures(id uuid primary key,home_team_id uuid,away_team_id uuid,home_score integer,away_score integer,status text,kickoff_at timestamptz);
create table app.story_teams(story_id uuid,team_id uuid);
create table app_private.ai_content_articles(article_edition_id uuid,fixture_id uuid,kind text);
