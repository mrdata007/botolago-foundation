begin;

select extensions.no_plan();

select extensions.is(
  (select count(*)::integer from pg_enum enum_row
   join pg_type type_row on type_row.oid = enum_row.enumtypid
   join pg_namespace namespace on namespace.oid = type_row.typnamespace
   where namespace.nspname = 'app' and type_row.typname = 'fixture_status'),
  13,
  'fixture status model contains the complete normalized lifecycle'
);

select extensions.ok(
  not exists (
    select 1 from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'app'
      and relation.relkind in ('r', 'p')
      and (not relation.relrowsecurity or not relation.relforcerowsecurity)
  ),
  'every canonical Football table enables and forces RLS'
);
select extensions.ok(
  not exists (
    select 1 from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'app_private'
      and relation.relname like 'football_%'
      and relation.relkind in ('r', 'p')
      and (not relation.relrowsecurity or not relation.relforcerowsecurity)
  ),
  'every private Football operations table enables and forces RLS'
);

insert into app.countries (id, iso_alpha2, iso_alpha3, flag_emoji)
values ('10000000-0000-4000-8000-000000000001', 'MA', 'MAR', '🇲🇦');
insert into app.country_translations (country_id, language, display_name)
values
  ('10000000-0000-4000-8000-000000000001', 'fr', 'Maroc'),
  ('10000000-0000-4000-8000-000000000001', 'ar', 'المغرب');
insert into app.venues (id, slug, default_name, city, country_id, capacity)
values (
  '20000000-0000-4000-8000-000000000001', 'stade-test', 'Stade Test',
  'Casablanca', '10000000-0000-4000-8000-000000000001', 45000
);
insert into app.venue_translations (venue_id, language, display_name, city_name)
values (
  '20000000-0000-4000-8000-000000000001', 'ar', 'ملعب الاختبار', 'الدار البيضاء'
);
insert into app.competitions (
  id, slug, name, short_name, competition_type, country_id, display_order
) values (
  '30000000-0000-4000-8000-000000000001', 'botola-test',
  'Botola Test', 'BT', 'league', '10000000-0000-4000-8000-000000000001', 1
);
insert into app.competition_translations (competition_id, language, display_name, short_name)
values (
  '30000000-0000-4000-8000-000000000001', 'ar', 'البطولة التجريبية', 'ب ت'
);
insert into app.seasons (
  id, competition_id, label, starts_on, ends_on, status, is_current
) values (
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '2029/30', '2029-08-01', '2030-06-30', 'active', true
);
insert into app.rounds (id, season_id, round_number, name, status)
values (
  '50000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001', 1, 'Round 1', 'active'
);
insert into app.teams (
  id, slug, name, short_name, code, country_id, city, venue_id, primary_color
) values
  (
    '60000000-0000-4000-8000-000000000001', 'home-test', 'Home Test', 'HOME',
    'HOM', '10000000-0000-4000-8000-000000000001', 'Casablanca',
    '20000000-0000-4000-8000-000000000001', '#112233'
  ),
  (
    '60000000-0000-4000-8000-000000000002', 'away-test', 'Away Test', 'AWAY',
    'AWY', '10000000-0000-4000-8000-000000000001', 'Rabat', null, '#334455'
  );
insert into app.players (
  id, slug, full_name, display_name, position
) values (
  '70000000-0000-4000-8000-000000000001', 'player-test',
  'Player Test', 'P. Test', 'midfielder'
);
-- Date of birth, nationality and foot are written only by the attribute
-- resolver, from observations (20260926060000).
do $$
begin
  perform app_private.record_player_attribute_observation(
    '70000000-0000-4000-8000-000000000001', attribute, value_text, null,
    'provider', 'sportsmonks', 'test-fixture', '2029-08-01T00:00:00Z')
  from (values ('date_of_birth', '2000-01-01'), ('nationality', 'MA'),
    ('preferred_foot', 'right')) observed(attribute, value_text);
  perform app_private.resolve_player_attributes(array['70000000-0000-4000-8000-000000000001'::uuid]);
end;
$$;
insert into app.team_memberships (
  id, player_id, team_id, season_id, shirt_number, valid_from
) values (
  '80000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001', 8, '2029-08-01'
);

select extensions.is(
  app_private.football_team_json('60000000-0000-4000-8000-000000000001', 'fr') ->> 'shortName',
  'HOME',
  'team DTO helper returns canonical summary fields'
);
select extensions.is(
  app_private.football_competition_json('30000000-0000-4000-8000-000000000001', 'ar') ->> 'name',
  'البطولة التجريبية',
  'competition DTO helper uses relational Arabic translation'
);
select extensions.is(
  app_private.football_venue_json('20000000-0000-4000-8000-000000000001', 'ar') ->> 'name',
  'ملعب الاختبار',
  'venue DTO helper uses relational Arabic translation'
);

select extensions.throws_ok(
  $$insert into app.seasons (competition_id, label, starts_on, ends_on)
    values ('30000000-0000-4000-8000-000000000001', 'invalid', '2030-06-01', '2030-05-01')$$,
  '23514',
  null,
  'season end cannot precede its start'
);
select extensions.throws_ok(
  $$insert into app.teams (slug, name, short_name, primary_color)
    values ('bad-color', 'Bad Color', 'BAD', 'red')$$,
  '23514',
  null,
  'team colors must use deterministic six-digit hex format'
);
select extensions.throws_ok(
  $$insert into app.team_memberships (
      player_id, team_id, season_id, valid_from
    ) values (
      '70000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000001', '2029-09-01'
    )$$,
  '23P01',
  'OVERLAPPING_TEAM_MEMBERSHIP',
  'a player cannot hold overlapping active memberships in one season'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '90000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'football-fk@example.test', 'hash',
  '{}'::jsonb, '{"username":"football_fk"}'::jsonb,
  statement_timestamp(), statement_timestamp()
);
update app.user_preferences
set favorite_team_id = '60000000-0000-4000-8000-000000000001'
where user_id = '90000000-0000-4000-8000-000000000001';
insert into app.followed_teams (user_id, team_id)
values (
  '90000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001'
);
insert into app.followed_competitions (user_id, competition_id)
values (
  '90000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001'
);
select extensions.is(
  (select count(*)::integer from app.followed_teams where user_id = '90000000-0000-4000-8000-000000000001'),
  1,
  'identity team follows reference canonical Football teams'
);
select extensions.is(
  (select count(*)::integer from app.followed_competitions where user_id = '90000000-0000-4000-8000-000000000001'),
  1,
  'identity competition follows reference canonical Football competitions'
);

select * from extensions.finish();
rollback;
