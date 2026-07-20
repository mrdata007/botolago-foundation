-- BotolaGO V2 — Phase 5: resume fan-out after the last committed audience cursor.
-- This replaces the claim function without changing its signature or grants.

create or replace function api.service_claim_notification_event(
  p_event_id uuid,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target app_private.notification_events%rowtype;
  run_id uuid;
  run_checkpoint_user_id uuid;
begin
  if not app_private.is_service_request() then
    raise exception using errcode = 'PT403', message = 'notification_access_denied';
  end if;
  if p_lease_seconds not between 30 and 600 then
    raise exception using errcode = 'PT400', message = 'invalid_notification_event';
  end if;

  select * into target
  from app_private.notification_events
  where id = p_event_id
  for update;

  if not found then
    raise exception using errcode = 'PT404', message = 'notification_not_found';
  end if;
  if target.status = 'completed' then
    return jsonb_build_object('claimed', false, 'completed', true);
  end if;

  insert into app_private.notification_fanout_runs (
    event_id, status, claimed_at, claim_expires_at, started_at
  ) values (
    p_event_id,
    'processing',
    statement_timestamp(),
    statement_timestamp() + make_interval(secs => p_lease_seconds),
    statement_timestamp()
  )
  on conflict (event_id) do update set
    status = 'processing',
    claimed_at = statement_timestamp(),
    claim_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
    started_at = coalesce(
      app_private.notification_fanout_runs.started_at,
      statement_timestamp()
    )
  where app_private.notification_fanout_runs.claim_expires_at is null
    or app_private.notification_fanout_runs.claim_expires_at < statement_timestamp()
    or app_private.notification_fanout_runs.status in ('pending', 'partially_failed', 'failed')
  returning id, checkpoint_user_id
  into run_id, run_checkpoint_user_id;

  if run_id is null then
    return jsonb_build_object('claimed', false, 'completed', false);
  end if;

  update app_private.notification_events
  set
    status = 'processing',
    processing_started_at = coalesce(processing_started_at, statement_timestamp())
  where id = p_event_id;

  return jsonb_build_object(
    'claimed', true,
    'runId', run_id,
    'checkpointUserId', run_checkpoint_user_id,
    'eventId', target.id,
    'type', target.event_type,
    'sourceDomain', target.source_domain,
    'sourceEntityId', target.source_entity_id,
    'targetUserId', target.target_user_id,
    'occurredAt', target.occurred_at,
    'schemaVersion', target.schema_version,
    'correlationId', target.correlation_id,
    'payload', target.safe_payload
  );
end;
$$;

comment on function api.service_claim_notification_event(uuid, integer) is
  'Trusted lease claim returning the last committed fan-out cursor for bounded resume.';
