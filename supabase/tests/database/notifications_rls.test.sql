begin;

select extensions.no_plan();

select extensions.ok(
  (select bool_and(relrowsecurity and relforcerowsecurity)
   from pg_class
   where oid in (
     'app.notification_templates'::regclass,
     'app.notifications'::regclass,
     'app.notification_deliveries'::regclass,
     'app.device_registrations'::regclass,
     'app.notification_subscriptions'::regclass,
     'app_private.notification_events'::regclass,
     'app_private.notification_fanout_runs'::regclass,
     'app_private.notification_schedules'::regclass,
     'app_private.push_destinations'::regclass,
     'app_private.notification_delivery_attempts'::regclass,
     'app_private.notification_dead_letters'::regclass,
     'app_private.notification_operational_audit'::regclass
   )),
  'all canonical and private Notification tables enable and force RLS'
);

select extensions.ok(
  not has_table_privilege('anon', 'app.notifications', 'select'),
  'anonymous has no direct notification table access'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'app.notifications', 'insert'),
  'authenticated browser cannot create arbitrary notifications'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'app.notification_deliveries', 'update'),
  'authenticated browser cannot mutate delivery state'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'app.notification_templates', 'update'),
  'authenticated browser cannot mutate templates'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'app_private.push_destinations', 'select'),
  'authenticated browser cannot read push destinations'
);
select extensions.ok(
  not has_table_privilege('service_role', 'app_private.notification_dead_letters', 'update'),
  'service role must replay dead letters through controlled RPCs'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select api.list_my_notifications()$$,
  '42501', null,
  'anonymous cannot invoke owner notification APIs'
);
select extensions.throws_ok(
  $$select api.service_claim_notification_deliveries()$$,
  '42501', null,
  'anonymous cannot invoke delivery workers'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"15000000-0000-4000-8000-000000000001","role":"authenticated"}', true
);
select extensions.throws_ok(
  $$select * from app.notifications$$,
  '42501', null,
  'authenticated browser cannot bypass owner RPCs with direct canonical reads'
);
select extensions.throws_ok(
  $$select * from app_private.notification_events$$,
  '42501', null,
  'authenticated browser cannot access private event state'
);
select extensions.throws_ok(
  $$select api.service_ingest_notification_event(
      gen_random_uuid(), 'password_changed', 'identity', null,
      '15000000-0000-4000-8000-000000000001', statement_timestamp(), 1,
      'unauthorized:event:1', gen_random_uuid(), '{}'::jsonb
    )$$,
  '42501', null,
  'authenticated browser cannot ingest arbitrary notification events'
);
select extensions.throws_ok(
  $$select api.service_notification_metrics()$$,
  '42501', null,
  'operational metrics are not public'
);
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.ok(
  jsonb_typeof(api.service_notification_metrics()) = 'object',
  'service role can access bounded operational metrics through its RPC'
);
select extensions.throws_ok(
  $$select * from app_private.notification_dead_letters$$,
  '42501', null,
  'service role cannot directly enumerate dead letters'
);
reset role;

select * from extensions.finish();
rollback;
