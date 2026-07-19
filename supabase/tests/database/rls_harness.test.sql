begin;

select extensions.plan(10);

create table app.rls_probe (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  secret text not null
);
alter table app.rls_probe enable row level security;
alter table app.rls_probe force row level security;

grant usage on schema app to authenticated;
grant select, insert, update, delete on app.rls_probe to authenticated;

create policy rls_probe_select_own on app.rls_probe
for select to authenticated
using (owner_id = (select auth.uid()));
create policy rls_probe_insert_own on app.rls_probe
for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy rls_probe_update_own on app.rls_probe
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy rls_probe_delete_own on app.rls_probe
for delete to authenticated
using (owner_id = (select auth.uid()));

insert into app.rls_probe (owner_id, secret)
values
  ('11111111-1111-4111-8111-111111111111', 'alice-only'),
  ('22222222-2222-4222-8222-222222222222', 'bob-only');

select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'app.rls_probe'::regclass),
  'probe has RLS enabled'
);
select extensions.ok(
  (select relforcerowsecurity from pg_class where oid = 'app.rls_probe'::regclass),
  'probe forces RLS for table owners'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select extensions.is(
  auth.uid(),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'test JWT resolves Alice identity'
);
select extensions.is(
  (select count(*)::integer from app.rls_probe),
  1,
  'Alice sees only her row'
);
select extensions.lives_ok(
  $$insert into app.rls_probe (owner_id, secret)
    values ('11111111-1111-4111-8111-111111111111', 'alice-second')$$,
  'Alice can insert her own row'
);
select extensions.throws_ok(
  $$insert into app.rls_probe (owner_id, secret)
    values ('22222222-2222-4222-8222-222222222222', 'forged')$$,
  '42501',
  null,
  'Alice cannot insert a row owned by Bob'
);

update app.rls_probe set secret = 'hacked' where owner_id = '22222222-2222-4222-8222-222222222222';
delete from app.rls_probe where owner_id = '22222222-2222-4222-8222-222222222222';

reset role;
select extensions.is(
  (select secret from app.rls_probe where owner_id = '22222222-2222-4222-8222-222222222222'),
  'bob-only',
  'Alice cannot update Bob row'
);
select extensions.is(
  (select count(*)::integer from app.rls_probe where owner_id = '22222222-2222-4222-8222-222222222222'),
  1,
  'Alice cannot delete Bob row'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select extensions.is(
  (select count(*)::integer from app.rls_probe),
  1,
  'Bob sees only his row'
);
reset role;

select extensions.ok(
  not has_table_privilege('anon', 'app.rls_probe', 'select'),
  'anonymous role has no probe table access'
);

select * from extensions.finish();
rollback;
