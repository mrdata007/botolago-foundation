-- api.list_my_match_reminders: a user reads back only their own enabled
-- match reminders.
begin;
select extensions.no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '16000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reminder-one@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"reminder_one","preferred_language":"fr"}', statement_timestamp(), statement_timestamp()
  ),
  (
    '16000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reminder-two@example.test', statement_timestamp(), 'hash', '{}',
    '{"username":"reminder_two","preferred_language":"fr"}', statement_timestamp(), statement_timestamp()
  );

insert into app.countries(id, iso_alpha2, iso_alpha3)
values ('16100000-0000-4000-8000-000000000001', 'MA', 'MAR');
insert into app.competitions(id, slug, name, short_name, competition_type, country_id)
values ('16200000-0000-4000-8000-000000000001', 'reminder-league', 'Reminder League',
  'RL', 'league', '16100000-0000-4000-8000-000000000001');
insert into app.seasons(id, competition_id, label, starts_on, ends_on, status, is_current)
values ('16300000-0000-4000-8000-000000000001', '16200000-0000-4000-8000-000000000001',
  'Reminder season', current_date - 60, current_date + 200, 'active', true);
insert into app.rounds(id, season_id, round_number, name)
values ('16400000-0000-4000-8000-000000000001', '16300000-0000-4000-8000-000000000001', 1, 'Round 1');
insert into app.teams(id, slug, name, short_name, code, country_id)
select ('16500000-0000-4000-8000-00000000000' || n)::uuid, 'reminder-club-' || n,
  'Reminder Club ' || n, 'RC' || n, 'RC' || n, '16100000-0000-4000-8000-000000000001'
from generate_series(1, 4) n;
insert into app.fixtures(id, competition_id, season_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, provider_updated_at, source_sequence)
select ('16600000-0000-4000-8000-00000000000' || n)::uuid,
  '16200000-0000-4000-8000-000000000001', '16300000-0000-4000-8000-000000000001',
  '16400000-0000-4000-8000-000000000001',
  '16500000-0000-4000-8000-000000000001', '16500000-0000-4000-8000-000000000002',
  statement_timestamp() + (n || ' days')::interval, 'not_started',
  statement_timestamp() - interval '1 day', 1
from generate_series(1, 3) n;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}', true
);

select extensions.is(
  api.list_my_match_reminders(),
  '[]'::jsonb,
  'a user with no reminder reads an empty list'
);

select api.set_my_notification_subscription('match', '16600000-0000-4000-8000-000000000001', true);
select api.set_my_notification_subscription('match', '16600000-0000-4000-8000-000000000002', true);
select api.set_my_notification_subscription('match', '16600000-0000-4000-8000-000000000003', true);
select api.set_my_notification_subscription('match', '16600000-0000-4000-8000-000000000002', false);

select extensions.is(
  jsonb_array_length(api.list_my_match_reminders()),
  2,
  'the list holds the enabled reminders only'
);
select extensions.ok(
  api.list_my_match_reminders() @> '["16600000-0000-4000-8000-000000000001"]'::jsonb
    and not (api.list_my_match_reminders() @> '["16600000-0000-4000-8000-000000000002"]'::jsonb),
  'a reminder turned off leaves the list'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}', true
);
select extensions.is(
  api.list_my_match_reminders(),
  '[]'::jsonb,
  'another user never sees them'
);

reset role;
set local role anon;
select extensions.throws_ok(
  $$ select api.list_my_match_reminders() $$,
  '42501',
  null,
  'a signed-out caller cannot call it'
);

select * from extensions.finish();
rollback;
