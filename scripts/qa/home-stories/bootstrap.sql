-- Disposable PostgreSQL harness only. Auth/storage shapes are supplied locally;
-- authorization functions and role/permission seeds come from the real migration.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema app; create schema app_private; create schema api; create schema auth; create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema api, app, auth to anon, authenticated;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz);
create table auth.mfa_factors(id uuid primary key,user_id uuid,status text);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
create function app_private.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end; $$;
create table app.media_assets(id uuid primary key,storage_path text,mime_type text,validation_status text,credit text);
create table app_private.editorial_audit_events(event_type text,actor_user_id uuid,story_id uuid,article_edition_id uuid,metadata jsonb);
