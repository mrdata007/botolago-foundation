begin;

select extensions.no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '15000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'notify-one@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"notify_one","preferred_language":"fr"}', statement_timestamp(), statement_timestamp()
  ),
  (
    '15000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'notify-two@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"notify_two","preferred_language":"ar"}', statement_timestamp(), statement_timestamp()
  );

select extensions.is(
  (select notification_timezone from app.user_preferences
   where user_id = '15000000-0000-4000-8000-000000000001'),
  'Africa/Casablanca',
  'notification preferences backfill an explicit timezone default'
);
select extensions.is(
  (select push_notifications_enabled from app.user_preferences
   where user_id = '15000000-0000-4000-8000-000000000001'),
  false,
  'push defaults off until explicit user consent and provider approval'
);
select extensions.is(
  (select count(*)::integer from app.notification_templates
   where template_key = 'password_changed' and active),
  2,
  'mandatory password template has active French and Arabic editions'
);
select extensions.is(
  app_private.render_notification_template(
    '{{team}} marque', array['team'], '{"team":"الرجاء"}'::jsonb
  ),
  'الرجاء marque',
  'template rendering preserves Arabic variables'
);
select extensions.throws_ok(
  $$select app_private.render_notification_template(
      '{{team}} marque', array['team'], '{}'::jsonb
    )$$,
  '22023', 'template_variable_missing',
  'template rendering rejects missing variables'
);
select extensions.is(
  app_private.defer_for_quiet_hours(
    '2030-01-01T23:30:00Z', 'UTC', true, '22:00', '07:00', false
  ),
  '2030-01-02T07:00:00Z'::timestamptz,
  'quiet hours crossing midnight defer to the next local boundary'
);
select extensions.is(
  app_private.defer_for_quiet_hours(
    '2030-01-01T23:30:00Z', 'UTC', true, '22:00', '07:00', true
  ),
  '2030-01-01T23:30:00Z'::timestamptz,
  'mandatory security delivery bypasses quiet hours'
);
select extensions.throws_ok(
  $$update app.user_preferences set notification_timezone = 'Not/A_Timezone'
    where user_id = '15000000-0000-4000-8000-000000000001'$$,
  '22023', 'quiet_hours_invalid',
  'unknown IANA timezones are rejected server-side'
);
select extensions.throws_ok(
  $$insert into app.notification_subscriptions (user_id, kind, enabled)
    values ('15000000-0000-4000-8000-000000000001', 'team', true)$$,
  '23514', null,
  'normalized subscriptions require exactly one typed target'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select set_config(
  'test.notification_event_id',
  api.service_ingest_notification_event(
    '25000000-0000-4000-8000-000000000001',
    'password_changed', 'identity', null,
    '15000000-0000-4000-8000-000000000001',
    statement_timestamp(), 1, 'identity:password:notify-one:1',
    '35000000-0000-4000-8000-000000000001', '{}'::jsonb
  )::text,
  true
);
select extensions.is(
  api.service_ingest_notification_event(
    '25000000-0000-4000-8000-000000000099',
    'password_changed', 'identity', null,
    '15000000-0000-4000-8000-000000000001',
    statement_timestamp(), 1, 'identity:password:notify-one:1',
    '35000000-0000-4000-8000-000000000099', '{}'::jsonb
  ),
  current_setting('test.notification_event_id')::uuid,
  'event deduplication returns the original stable event ID'
);
select extensions.is(
  api.service_claim_notification_event(current_setting('test.notification_event_id')::uuid) ->> 'claimed',
  'true',
  'trusted worker atomically claims a pending event'
);
select extensions.is(
  jsonb_array_length(api.service_list_notification_audience(
    current_setting('test.notification_event_id')::uuid
  )),
  1,
  'direct Identity event resolves only its target user'
);
select set_config(
  'test.notification_id',
  api.service_create_user_notification(
    current_setting('test.notification_event_id')::uuid,
    '15000000-0000-4000-8000-000000000001', '{}'::jsonb,
    'high', 'security_action', null
  )::text,
  true
);
select extensions.is(
  api.service_create_user_notification(
    current_setting('test.notification_event_id')::uuid,
    '15000000-0000-4000-8000-000000000001', '{}'::jsonb,
    'high', 'security_action', null
  ),
  current_setting('test.notification_id')::uuid,
  'per-user notification creation is idempotent'
);
select extensions.ok(
  api.service_checkpoint_notification_fanout(
    current_setting('test.notification_event_id')::uuid,
    '15000000-0000-4000-8000-000000000001',
    1, 1, 1, 0, 0, false
  ),
  'fan-out commits a bounded audience checkpoint'
);
reset role;
select extensions.is(
  (select count(*)::integer from app.notification_deliveries
   where notification_id = current_setting('test.notification_id')::uuid and channel = 'in_app'),
  1,
  'one in-app delivery exists for an idempotent notification'
);
update app_private.notification_fanout_runs
set claimed_at = statement_timestamp() - interval '2 seconds',
    claim_expires_at = statement_timestamp() - interval '1 second'
where event_id = current_setting('test.notification_event_id')::uuid;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(
  api.service_claim_notification_event(
    current_setting('test.notification_event_id')::uuid
  ) ->> 'checkpointUserId',
  '15000000-0000-4000-8000-000000000001',
  'reclaimed fan-out resumes from the last committed audience cursor'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"15000000-0000-4000-8000-000000000001","role":"authenticated"}', true
);
select extensions.is(
  api.my_notification_unread_count(),
  1::bigint,
  'owner unread count includes the available notification'
);
select extensions.is(
  jsonb_array_length(api.list_my_notifications() -> 'items'),
  1,
  'owner receives a bounded notification feed'
);
select extensions.ok(
  api.mark_my_notification_read(current_setting('test.notification_id')::uuid),
  'owner marks one notification read'
);
select extensions.is(api.my_notification_unread_count(), 0::bigint, 'read state updates unread count');
select extensions.ok(
  api.mark_my_notification_read(current_setting('test.notification_id')::uuid, false),
  'mark-unread is explicit and ownership-safe'
);
select extensions.is(
  api.mark_all_my_notifications_read(),
  1,
  'mark-all-read updates the bounded owner set'
);
select extensions.is(
  api.update_my_notification_preferences(
    false, true, false, false, false, false, false, 'UTC',
    true, '22:00', '07:00', 'immediate', 1440
  ) -> 'quietHours' ->> 'enabled',
  'true',
  'preference update atomically persists quiet hours and channel/category switches'
);
select set_config(
  'test.device_id',
  api.register_my_notification_device(
    'browser-device-0001', 'web', 'fixture', 'private-fixture-token-00000001',
    'fr', 'Africa/Casablanca', '1.0.0'
  ) ->> 'id',
  true
);
select extensions.is(
  jsonb_array_length(api.list_my_notification_devices()),
  1,
  'owner lists one safe device summary'
);
select extensions.ok(
  not ((api.list_my_notification_devices() -> 0) ? 'destination'),
  'safe device summaries never expose raw destinations'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"15000000-0000-4000-8000-000000000002","role":"authenticated"}', true
);
select extensions.throws_ok(
  $$select api.register_my_notification_device(
      'browser-device-0002', 'web', 'fixture', 'private-fixture-token-00000001',
      'ar', 'Africa/Casablanca', '1.0.0'
    )$$,
  'PT409', 'device_token_conflict',
  'a destination cannot be reassigned across users'
);
select extensions.is(
  jsonb_array_length(api.list_my_notifications() -> 'items'),
  0,
  'second user cannot read first user notifications'
);
reset role;

select extensions.is(
  (select count(*)::integer from app_private.notification_operational_audit
   where event_type in ('notification_preferences_updated', 'notification_device_registered')),
  2,
  'sensitive preferences and device registration produce append-only audit events'
);

select * from extensions.finish();
rollback;
