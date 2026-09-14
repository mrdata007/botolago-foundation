begin;
select extensions.no_plan();

select extensions.ok(
  not has_function_privilege('anon', 'api.service_elbotola_source_status()', 'execute')
  and not has_function_privilege('authenticated', 'api.service_elbotola_source_status()', 'execute')
  and has_function_privilege('service_role', 'api.service_elbotola_source_status()', 'execute'),
  'ElBotola source status is service-only'
);
select extensions.ok(
  not has_function_privilege('anon', 'api.service_set_elbotola_source_active(boolean)', 'execute')
  and not has_function_privilege('authenticated', 'api.service_set_elbotola_source_active(boolean)', 'execute')
  and has_function_privilege('service_role', 'api.service_set_elbotola_source_active(boolean)', 'execute'),
  'ElBotola source activation is service-only'
);
select extensions.is((select active from app.publishers where slug='elbotola'), false,
  'installing source controls leaves ElBotola inactive');

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select extensions.throws_ok($$select api.service_elbotola_source_status()$$,
  'PT403', 'forbidden', 'status rejects user claims even through a privileged connection');
select extensions.throws_ok($$select api.service_set_elbotola_source_active(true)$$,
  'PT403', 'forbidden', 'activation rejects user claims even through a privileged connection');
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok($$select api.service_set_elbotola_source_active(false)$$,
  'PT403', 'forbidden', 'anonymous callers cannot deactivate the feed');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select extensions.is(api.service_elbotola_source_status(), jsonb_build_object(
  'slug','elbotola', 'active',false, 'trustStatus','review_required', 'websiteUrl','https://www.elbotola.com/'
), 'status reflects the existing inactive source without modifying it');
select extensions.throws_ok($$select api.service_set_elbotola_source_active(null)$$,
  'PT400', 'elbotola_active_required', 'a missing activation decision is rejected');
select extensions.is(api.service_set_elbotola_source_active(true), jsonb_build_object(
  'slug','elbotola', 'previousActive',false, 'currentActive',true,
  'trustStatus','trusted', 'websiteUrl','https://www.elbotola.com/'
), 'explicit service activation reports previous and current source state');
select extensions.is(api.service_elbotola_source_status()->>'active', 'true',
  'status reports the persisted active state');
select extensions.is(api.service_set_elbotola_source_active(true)->>'previousActive', 'true',
  'repeated activation truthfully reports the source was already active');
select extensions.is(api.service_set_elbotola_source_active(false), jsonb_build_object(
  'slug','elbotola', 'previousActive',true, 'currentActive',false,
  'trustStatus','trusted', 'websiteUrl','https://www.elbotola.com/'
), 'service rollback deactivates the source without removing its trust assessment');
select extensions.is(api.service_elbotola_source_status()->>'active', 'false',
  'status reports the persisted inactive state');

update app.publishers set trust_status='blocked' where slug='elbotola';
select extensions.is(api.service_elbotola_source_status()->>'trustStatus', 'blocked',
  'status truthfully reports a blocked source');
select extensions.throws_ok($$select api.service_set_elbotola_source_active(true)$$,
  'PT409', 'elbotola_source_blocked', 'activation cannot override a blocked publisher');
select extensions.is((select active from app.publishers where slug='elbotola'), false,
  'rejected blocked-source activation preserves inactivity');

update app.publishers set trust_status='review_required', website_url='https://example.com/' where slug='elbotola';
select extensions.throws_ok($$select api.service_set_elbotola_source_active(true)$$,
  'PT409', 'elbotola_source_origin_mismatch', 'a changed publisher origin cannot be activated');
select extensions.is((select active from app.publishers where slug='elbotola'), false,
  'rejected origin mismatch preserves inactivity');

select * from extensions.finish();
rollback;
