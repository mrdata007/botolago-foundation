-- Fixed-source service controls for the owner-approved ElBotola metadata feed.
-- This migration creates no ingestion run and does not activate any publisher.

create function api.service_elbotola_source_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_publisher app.publishers%rowtype;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  select * into target_publisher from app.publishers where slug = 'elbotola';
  if not found then
    raise exception using errcode = 'PT404', message = 'elbotola_publisher_missing';
  end if;
  return jsonb_build_object(
    'slug', target_publisher.slug,
    'active', target_publisher.active,
    'trustStatus', target_publisher.trust_status,
    'websiteUrl', target_publisher.website_url
  );
end;
$$;

create function api.service_set_elbotola_source_active(p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_publisher app.publishers%rowtype;
  current_trust app.publisher_trust_status;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'forbidden';
  end if;
  if p_active is null then
    raise exception using errcode = 'PT400', message = 'elbotola_active_required';
  end if;
  select * into target_publisher from app.publishers
  where slug = 'elbotola' for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'elbotola_publisher_missing';
  end if;
  if target_publisher.website_url is null or target_publisher.website_url not in (
    'https://www.elbotola.com', 'https://www.elbotola.com/'
  ) then
    raise exception using errcode = 'PT409', message = 'elbotola_source_origin_mismatch';
  end if;
  if target_publisher.trust_status = 'blocked' then
    raise exception using errcode = 'PT409', message = 'elbotola_source_blocked';
  end if;
  update app.publishers set
    active = p_active,
    trust_status = case when p_active then 'trusted'::app.publisher_trust_status else trust_status end,
    updated_at = statement_timestamp()
  where id = target_publisher.id
  returning trust_status into current_trust;
  return jsonb_build_object(
    'slug', target_publisher.slug,
    'previousActive', target_publisher.active,
    'currentActive', p_active,
    'trustStatus', current_trust,
    'websiteUrl', target_publisher.website_url
  );
end;
$$;

revoke all on function api.service_elbotola_source_status()
  from public, anon, authenticated, service_role;
revoke all on function api.service_set_elbotola_source_active(boolean)
  from public, anon, authenticated, service_role;
grant execute on function api.service_elbotola_source_status() to service_role;
grant execute on function api.service_set_elbotola_source_active(boolean) to service_role;
notify pgrst, 'reload schema';
