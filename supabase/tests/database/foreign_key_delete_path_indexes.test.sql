-- Indexes for two foreign keys that a delete scans once per deleted row
-- (20260925210300_foreign_key_delete_path_indexes.sql, audit A13 / DB-05).
--
-- PostgreSQL runs a foreign key's ON DELETE action once per deleted
-- referenced row, from a plan it prepares once and caches. Written out, the
-- action here is:
--   update only <table> set <column> = null where $1 = <column>
-- This file checks that each index exists as reviewed, that the cached
-- (generic) form of that statement can use it, which is not a given for a
-- partial index, and that the SET NULL actions still behave as before.
begin;
select extensions.plan(11);

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('a1300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- The plan of a statement, as text.
create function pg_temp.plan_of(p_statement text) returns text language plpgsql as $$
declare
  line text;
  plan text := '';
begin
  for line in execute 'explain (costs off) ' || p_statement loop
    plan := plan || line || E'\n';
  end loop;
  return plan;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select extensions.is(
  (select indexdef from pg_indexes
   where schemaname = 'app' and indexname = 'stories_import_converted_by_idx'),
  'CREATE INDEX stories_import_converted_by_idx ON app.stories USING btree (import_converted_by) '
    || 'WHERE (import_converted_by IS NOT NULL)',
  'app.stories has a partial index on import_converted_by'
);
select extensions.is(
  (select indexdef from pg_indexes
   where schemaname = 'app_private' and indexname = 'notification_email_unsubscribe_tokens_delivery_idx'),
  'CREATE INDEX notification_email_unsubscribe_tokens_delivery_idx ON '
    || 'app_private.notification_email_unsubscribe_tokens USING btree (delivery_id) '
    || 'WHERE (delivery_id IS NOT NULL)',
  'the unsubscribe tokens have a partial index on delivery_id'
);
select extensions.ok(
  (select bool_and(indisvalid and indisready and not indisunique)
   from pg_index
   where indexrelid in ('app.stories_import_converted_by_idx'::regclass,
     'app_private.notification_email_unsubscribe_tokens_delivery_idx'::regclass)),
  'both indexes are valid, ready and not unique'
);
select extensions.is(
  (select array_agg(pg_get_constraintdef(oid) order by conname)
   from pg_constraint
   where conname in ('stories_import_converted_by_fkey',
     'notification_email_unsubscribe_tokens_delivery_id_fkey')),
  array[
    'FOREIGN KEY (delivery_id) REFERENCES app.notification_deliveries(id) ON DELETE SET NULL',
    'FOREIGN KEY (import_converted_by) REFERENCES auth.users(id) ON DELETE SET NULL'
  ],
  'the two foreign keys are unchanged'
);

-- ---------------------------------------------------------------------------
-- The FK action's cached plan can use each index
-- ---------------------------------------------------------------------------
-- A generic plan keeps $1 as a parameter, as the FK trigger's cached plan
-- does. With sequential scans priced out, the planner picks the index if and
-- only if it can prove "$1 = column" implies the partial predicate.
set local plan_cache_mode = force_generic_plan;
set local enable_seqscan = off;
prepare stories_set_null(uuid) as
  update only app.stories set import_converted_by = null where $1 = import_converted_by;
prepare tokens_set_null(uuid) as
  update only app_private.notification_email_unsubscribe_tokens set delivery_id = null
  where $1 = delivery_id;

select extensions.ok(
  plan ~ '(Index Scan using|Bitmap Index Scan on) stories_import_converted_by_idx\M'
    and plan ~ 'Index Cond: \((import_converted_by = \$1|\$1 = import_converted_by)\)',
  'deleting an auth user can null import_converted_by through the index'
)
from pg_temp.plan_of('execute stories_set_null(''a1300000-0000-4000-8000-000000000001'')') as plan;
select extensions.ok(
  plan ~ '(Index Scan using|Bitmap Index Scan on) notification_email_unsubscribe_tokens_delivery_idx\M'
    and plan ~ 'Index Cond: \((delivery_id = \$1|\$1 = delivery_id)\)',
  'deleting a delivery can null its token''s delivery_id through the index'
)
from pg_temp.plan_of('execute tokens_set_null(''a1300000-0000-4000-8000-000000000001'')') as plan;
deallocate stories_set_null;
deallocate tokens_set_null;
reset enable_seqscan;
reset plan_cache_mode;

-- ---------------------------------------------------------------------------
-- The SET NULL actions behave as before
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
  encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.id(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'fk-index-' || n || '@example.test', statement_timestamp(), 'hash', '{}',
  jsonb_build_object('username', 'fk_index_' || n, 'display_name', 'FK Index ' || n),
  statement_timestamp(), statement_timestamp()
from generate_series(1, 2) n;

-- A legacy import converted by account 1, and one converted by account 2.
insert into app.stories (id, origin, original_language, import_converted_at,
  import_converted_by, import_conversion_reason)
values
  (pg_temp.id(11), 'provider', 'fr', statement_timestamp(), pg_temp.id(1),
    'Converted for the foreign key index test.'),
  (pg_temp.id(12), 'provider', 'ar', statement_timestamp(), pg_temp.id(2),
    'Converted for the foreign key index test.');

delete from auth.users where id = pg_temp.id(1);
select extensions.is(
  (select array[import_converted_by is null, import_converted_at is not null,
     import_conversion_reason is not null]
   from app.stories where id = pg_temp.id(11)),
  array[true, true, true],
  'deleting the converting account nulls only import_converted_by; the story and its record stay'
);
select extensions.is(
  (select import_converted_by from app.stories where id = pg_temp.id(12)),
  pg_temp.id(2),
  'another account''s conversion is untouched'
);

-- Account 2 has two emailed notifications, each with its unsubscribe token.
insert into app_private.notification_events (id, event_type, source_domain, target_user_id,
  occurred_at, schema_version, deduplication_key, correlation_id)
select pg_temp.id(20 + n), 'password_changed', 'identity', pg_temp.id(2), statement_timestamp(), 1,
  'fk-index-test-event-' || n, pg_temp.id(25 + n)
from generate_series(1, 2) n;
insert into app.notifications (id, user_id, event_id, template_id, notification_type, category,
  language, title, body, source_domain)
select pg_temp.id(30 + n), pg_temp.id(2), pg_temp.id(20 + n), template.id, template.notification_type,
  template.category, 'fr', 'Avis ' || n, 'Texte ' || n, 'identity'
from generate_series(1, 2) n
cross join lateral (
  select id, notification_type, category from app.notification_templates
  where notification_type = 'password_changed' and language = 'fr'
  limit 1
) template;
insert into app.notification_deliveries (id, notification_id, channel, provider_key)
values
  (pg_temp.id(41), pg_temp.id(31), 'email', 'resend'),
  (pg_temp.id(42), pg_temp.id(32), 'email', 'resend');
insert into app_private.notification_email_unsubscribe_tokens (token_hash, user_id, delivery_id,
  expires_at)
values
  (extensions.digest('fk-index-token-1', 'sha256'), pg_temp.id(2), pg_temp.id(41),
    statement_timestamp() + interval '365 days'),
  (extensions.digest('fk-index-token-2', 'sha256'), pg_temp.id(2), pg_temp.id(42),
    statement_timestamp() + interval '365 days');

delete from app.notification_deliveries where id = pg_temp.id(41);
select extensions.is(
  (select delivery_id from app_private.notification_email_unsubscribe_tokens
   where token_hash = extensions.digest('fk-index-token-1', 'sha256')),
  null::uuid,
  'deleting a delivery nulls its token''s delivery_id'
);
select extensions.is(
  (select count(*)::integer from app_private.notification_email_unsubscribe_tokens
   where user_id = pg_temp.id(2)),
  2,
  'and keeps the token, so an email already sent can still unsubscribe'
);
select extensions.is(
  (select delivery_id from app_private.notification_email_unsubscribe_tokens
   where token_hash = extensions.digest('fk-index-token-2', 'sha256')),
  pg_temp.id(42),
  'another delivery''s token is untouched'
);

select * from extensions.finish();
rollback;
