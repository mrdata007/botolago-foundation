-- BotolaGO Production V2
-- Phase 1: non-feature foundation only.
--
-- Canonical data will live in app. The Data API exposes only api. Internal
-- trigger and policy helpers live in app_private. Every future object requires
-- an explicit grant; no application role receives table/function defaults.

create schema if not exists app;
create schema if not exists api;
create schema if not exists app_private;

comment on schema app is
  'Canonical BotolaGO relational data. Never expose this schema through PostgREST.';
comment on schema api is
  'Version-stable Data API views and RPCs. Every object requires an explicit grant.';
comment on schema app_private is
  'Non-exposed database helpers, trigger functions, and security internals.';

-- Extensions are installed explicitly so local, test, staging, and production
-- start from the same capabilities. pgTAP is used by migration and RLS tests.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

-- The public schema is intentionally outside the Data API. Prevent accidental
-- object creation by PUBLIC while preserving ownership for platform migrations.
revoke create on schema public from public;

revoke all on schema app from public, anon, authenticated, service_role;
revoke all on schema app_private from public, anon, authenticated, service_role;
revoke all on schema api from public, anon, authenticated, service_role;

-- API roles may resolve explicitly published api objects, but cannot create
-- objects or access anything until a feature migration grants object privileges.
grant usage on schema api to anon, authenticated, service_role;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove all
-- implicit object privileges in every application-owned schema. Feature
-- migrations must grant the minimum required privileges object by object.
alter default privileges for role postgres in schema app
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema app
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema app
  revoke all on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema app
  revoke all on types from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema api
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema api
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema api
  revoke all on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema api
  revoke all on types from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema app_private
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema app_private
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema app_private
  revoke all on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema app_private
  revoke all on types from public, anon, authenticated, service_role;

-- Standard trigger for tables that carry an updated_at timestamptz column.
-- It is SECURITY INVOKER, has an empty search_path, and cannot be called by API
-- roles. Future table migrations attach it as a BEFORE UPDATE trigger.
create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'app_private.set_updated_at() must be used by an UPDATE trigger';
  end if;

  new.updated_at := statement_timestamp();
  return new;
end;
$$;

comment on function app_private.set_updated_at() is
  'Sets NEW.updated_at for a BEFORE UPDATE trigger using database time.';

revoke all on function app_private.set_updated_at()
  from public, anon, authenticated, service_role;
grant execute on function app_private.set_updated_at() to postgres;
