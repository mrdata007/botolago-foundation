begin;
select extensions.plan(10);
select extensions.ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid='app.home_stories'::regclass), 'home stories enables and forces RLS');
select extensions.ok(not has_table_privilege('anon','app.home_stories','select,insert,update,delete'),
  'anonymous has no direct story table access');
select extensions.ok(not has_table_privilege('authenticated','app.home_stories','select,insert,update,delete'),
  'signed-in browsers have no direct story table access');
select extensions.ok(has_function_privilege('anon','api.home_stories()','execute'),
  'anonymous can read published stories');
select extensions.ok(not has_function_privilege('anon','api.admin_home_stories()','execute'),
  'anonymous cannot list drafts');
select extensions.ok(not has_function_privilege('anon','api.admin_save_home_story(uuid,integer,text,text,text,text,uuid,text,text,integer)','execute'),
  'anonymous cannot save stories');
select extensions.ok(not has_function_privilege('anon','api.admin_publish_home_story(uuid,integer,boolean)','execute'),
  'anonymous cannot publish stories');
select extensions.is(api.home_stories(),'[]'::jsonb,'empty feed is an empty array');
select set_config('request.jwt.claims','{}',true);
select extensions.throws_ok('select api.admin_home_stories()', 'PT401', 'staff_access_denied',
  'staff reads require a real session');
select extensions.throws_ok('select api.admin_publish_home_story(gen_random_uuid(),1,true)',
  'PT401','staff_access_denied','publishing requires a real session');
select * from extensions.finish();
rollback;
