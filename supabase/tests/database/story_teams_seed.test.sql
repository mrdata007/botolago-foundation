-- BG-0082 — supabase/migrations/20260921220000_story_teams_seed.sql
--
-- The seed matches a story to a current-season Botola Pro club by looking for
-- the club's real names in the edition TITLE. What the crest in
-- src/components/common/ArticleHeroFallback.tsx actually depends on is not
-- "did we find a club" but "did we find EXACTLY ONE", so the cases worth
-- pinning are the counts, not the mere presence of a row.
--
-- `supabase test db` runs from supabase/tests/database and a \i of a path
-- under supabase/migrations is not reachable from there — the same constraint
-- and the same remedy as
-- supabase/tests/database/football_deactivate_non_current_teams.test.sql.
-- The statement below is therefore a SYNCED COPY of the migration's insert,
-- byte-for-byte from `insert into app.story_teams` to the `on conflict` line,
-- wrapped in a pg_temp procedure so the test can run it twice.
--
-- Fixture shape: one current season with three participating clubs named
-- exactly as production names them (the alias list keys off app.teams.name),
-- plus one club that plays only the PRIOR season and must never be matched.
begin;

select extensions.no_plan();

-- ---------------------------------------------------------------------
-- Catalog fixture
-- ---------------------------------------------------------------------
insert into app.countries (id, iso_alpha2, iso_alpha3)
values ('b8200082-0000-4000-8000-00000000c001', 'MA', 'MAR');

insert into app.competitions (id, slug, name, short_name, competition_type, country_id, active)
values ('b8200082-0000-4000-8000-00000000d001', 'bg0082-league', 'BG0082 League', 'BGL',
  'league', 'b8200082-0000-4000-8000-00000000c001', true);

insert into app.seasons (id, competition_id, label, starts_on, ends_on, status, is_current)
values
  ('b8200082-0000-4000-8000-00000000e001', 'b8200082-0000-4000-8000-00000000d001',
    '2025/26', '2025-08-01', '2026-05-31', 'completed', false),
  ('b8200082-0000-4000-8000-00000000e002', 'b8200082-0000-4000-8000-00000000d001',
    '2026/27', '2026-08-01', '2027-05-31', 'active', true);

-- The names, short_names and codes are production's, including the two traps
-- the migration refuses to match on: Wydad's short_name is the literal code
-- 'WCA', and 'CR Khemis Zemamra' carries the disagreeing code 'RCAZ'.
insert into app.teams (id, slug, name, short_name, code, country_id, active)
values
  ('b8200082-0000-4000-8000-00000000a001', 'bg0082-wydad', 'Wydad Casablanca', 'WCA', 'WCA',
    'b8200082-0000-4000-8000-00000000c001', true),
  ('b8200082-0000-4000-8000-00000000a002', 'bg0082-raja', 'Raja Casablanca', 'Raja Casablanca', 'RCA',
    'b8200082-0000-4000-8000-00000000c001', true),
  ('b8200082-0000-4000-8000-00000000a003', 'bg0082-fus', 'FUS Rabat', 'FUS Rabat', 'FUS',
    'b8200082-0000-4000-8000-00000000c001', true),
  ('b8200082-0000-4000-8000-00000000b001', 'bg0082-zemamra', 'CR Khemis Zemamra', 'CR Khemis Zemamra', 'RCAZ',
    'b8200082-0000-4000-8000-00000000c001', true);

insert into app.players (id, slug, full_name, display_name, position, active)
select md5('bg0082-player:' || club)::uuid, 'bg0082-player-' || club,
  'BG0082 Player ' || club, 'BGP ' || club, 'midfielder'::app.football_position, true
from unnest(array['a001', 'a002', 'a003', 'b001']) club;

-- Current-season squad rows for the three Botola Pro clubs only. Zemamra has
-- a squad row in the PRIOR season, which is what makes it the relegated case.
insert into app.team_memberships (player_id, team_id, season_id, valid_from, active)
values
  (md5('bg0082-player:a001')::uuid, 'b8200082-0000-4000-8000-00000000a001',
    'b8200082-0000-4000-8000-00000000e002', '2026-08-01', true),
  (md5('bg0082-player:a002')::uuid, 'b8200082-0000-4000-8000-00000000a002',
    'b8200082-0000-4000-8000-00000000e002', '2026-08-01', true),
  (md5('bg0082-player:a003')::uuid, 'b8200082-0000-4000-8000-00000000a003',
    'b8200082-0000-4000-8000-00000000e002', '2026-08-01', true),
  (md5('bg0082-player:b001')::uuid, 'b8200082-0000-4000-8000-00000000b001',
    'b8200082-0000-4000-8000-00000000e001', '2025-08-01', true);

-- ---------------------------------------------------------------------
-- Story fixture — one story per case, each with a single Arabic edition,
-- shaped like the machine-ingested link-out stubs production holds.
-- ---------------------------------------------------------------------
insert into app.stories (id, origin, original_language, canonical_url, content_fingerprint)
values
  ('b8200082-0000-4000-8000-000000005001', 'provider', 'ar',
    'https://example.test/bg0082/one', repeat('1', 64)),
  ('b8200082-0000-4000-8000-000000005002', 'provider', 'ar',
    'https://example.test/bg0082/two', repeat('2', 64)),
  ('b8200082-0000-4000-8000-000000005003', 'provider', 'ar',
    'https://example.test/bg0082/none', repeat('3', 64)),
  ('b8200082-0000-4000-8000-000000005004', 'provider', 'ar',
    'https://example.test/bg0082/relegated', repeat('4', 64)),
  ('b8200082-0000-4000-8000-000000005005', 'provider', 'ar',
    'https://example.test/bg0082/foreign-al-fateh', repeat('5', 64));

insert into app.article_editions (
  story_id, language, slug, title, summary, body_format, body_source, body_html,
  reading_time_minutes, sanitizer_version
)
values
  -- 1. names exactly one club.
  ('b8200082-0000-4000-8000-000000005001', 'ar', 'bg0082-one',
    'الرجاء يتجه للاستغناء عن ساخو لتسجيل البرازيلي فيليبينهو',
    'خبر منشور على موقع خارجي. افتح المصدر الأصلي لقراءة التفاصيل.',
    'rich_text', null, '<p>خبر منشور على موقع خارجي. افتح المصدر الأصلي لقراءة التفاصيل.</p>', 1, 'bg0082-test-v1'),
  -- 2. names two clubs.
  ('b8200082-0000-4000-8000-000000005002', 'ar', 'bg0082-two',
    'استدعاء الزاكي لشرارة والرشدان يربك حسابات الرجاء والوداد قبل انطلاق البطولة',
    'خبر منشور على موقع خارجي. افتح المصدر الأصلي لقراءة التفاصيل.',
    'rich_text', null, '<p>خبر منشور على موقع خارجي. افتح المصدر الأصلي لقراءة التفاصيل.</p>', 1, 'bg0082-test-v1'),
  -- 3. names no club at all.
  ('b8200082-0000-4000-8000-000000005003', 'ar', 'bg0082-none',
    'هيرفي رونار: "المغرب هو المنتخب رقم واحد في إفريقيا"',
    'خبر منشور على موقع خارجي. افتح المصدر الأصلي لقراءة التفاصيل.',
    'rich_text', null, '<p>خبر منشور على موقع خارجي. افتح المصدر الأصلي لقراءة التفاصيل.</p>', 1, 'bg0082-test-v1'),
  -- 4. names a club that is not in the current season.
  ('b8200082-0000-4000-8000-000000005004', 'ar', 'bg0082-relegated',
    'نهضة الزمامرة يعلن تعاقده مع لاعب جديد استعدادا للموسم المقبل',
    'خبر منشور على موقع خارجي. افتح المصدر الأصلي لقراءة التفاصيل.',
    'rich_text', null, '<p>خبر منشور على موقع خارجي. افتح المصدر الأصلي لقراءة التفاصيل.</p>', 1, 'bg0082-test-v1'),
  -- 5. the bare token الفتح, which here is the SAUDI club, not FUS Rabat.
  ('b8200082-0000-4000-8000-000000005005', 'ar', 'bg0082-al-fateh',
    'رسميا/ إيقاف مدرب نيوم كريستوف غالتييه لـ3 مباريات بسبب حركته اللا رياضية أمام الفتح',
    'خبر منشور على موقع خارجي. افتح المصدر الأصلي لقراءة التفاصيل.',
    'rich_text', null, '<p>خبر منشور على موقع خارجي. افتح المصدر الأصلي لقراءة التفاصيل.</p>', 1, 'bg0082-test-v1');

-- ---------------------------------------------------------------------
-- Seed body — SYNCED COPY of supabase/migrations/20260921220000_story_teams_seed.sql
-- ---------------------------------------------------------------------
create procedure pg_temp.bg0082_seed_story_teams()
language sql
as $seed$
insert into app.story_teams (story_id, team_id)
with club_alias (team_name, alias, latin) as (values
  -- Arabic aliases first, then Latin. `latin` selects the match rule: Latin
  -- aliases are matched with non-alphanumeric boundaries on both sides (so
  -- "Raja" cannot match inside a longer word), Arabic aliases by plain
  -- containment (Arabic attaches prefixes such as و/ل/ب to the following word,
  -- which a leading boundary would reject; every Arabic alias here is a
  -- specific multi-word or definite form, so containment is safe).
  ('Wydad Casablanca',  'الوداد الرياضي',            false),
  ('Wydad Casablanca',  'الوداد البيضاوي',           false),
  ('Wydad Casablanca',  'الوداد',                    false),
  ('Wydad Casablanca',  'Wydad',                     true),
  ('Raja Casablanca',   'الرجاء الرياضي',            false),
  ('Raja Casablanca',   'الرجاء البيضاوي',           false),
  ('Raja Casablanca',   'الرجاء',                    false),
  ('Raja Casablanca',   'Raja',                      true),
  ('FAR Rabat',         'الجيش الملكي',              false),
  ('FAR Rabat',         'FAR Rabat',                 true),
  ('FAR Rabat',         'AS FAR',                    true),
  ('FUS Rabat',         'الفتح الرباطي',             false),
  ('FUS Rabat',         'الفتح الرياضي',             false),
  ('FUS Rabat',         'FUS Rabat',                 true),
  ('Maghreb Fès',       'المغرب الفاسي',             false),
  ('Maghreb Fès',       'Maghreb de Fès',            true),
  ('Maghreb Fès',       'Maghreb Fès',               true),
  ('Maghreb Fès',       'MAS Fès',                   true),
  ('Moghreb Tétouan',   'المغرب التطواني',           false),
  ('Moghreb Tétouan',   'Moghreb de Tétouan',        true),
  ('Moghreb Tétouan',   'Moghreb Tétouan',           true),
  ('Moghreb Tétouan',   'MAT Tétouan',               true),
  ('RSB Berkane',       'نهضة بركان',                false),
  ('RSB Berkane',       'RSB Berkane',               true),
  ('RSB Berkane',       'Renaissance de Berkane',    true),
  ('RSB Berkane',       'Berkane',                   true),
  ('Hassania Agadir',   'حسنية أكادير',              false),
  ('Hassania Agadir',   'Hassania',                  true),
  ('Difaâ El Jadida',   'الدفاع الحسني الجديدي',     false),
  ('Difaâ El Jadida',   'الدفاع الجديدي',            false),
  ('Difaâ El Jadida',   'Difaâ',                     true),
  ('Difaâ El Jadida',   'Difaa',                     true),
  ('Ittihad Tanger',    'اتحاد طنجة',                false),
  ('Ittihad Tanger',    'Ittihad de Tanger',         true),
  ('Ittihad Tanger',    'Ittihad Tanger',            true),
  ('Kawkab Marrakech',  'الكوكب المراكشي',           false),
  ('Kawkab Marrakech',  'Kawkab',                    true),
  ('UTS Rabat',         'اتحاد تواركة',              false),
  ('UTS Rabat',         'UTS Rabat',                 true),
  ('UTS Rabat',         'Touarga',                   true),
  ('Widad Témara',      'وداد تمارة',                false),
  ('Widad Témara',      'Widad de Témara',           true),
  ('Widad Témara',      'Widad Témara',              true),
  ('Amal Tiznit',       'أمل تيزنيت',                false),
  ('Amal Tiznit',       'Amal Tiznit',               true),
  ('CODM Meknès',       'النادي المكناسي',           false),
  ('CODM Meknès',       'CODM',                      true),
  ('CR Khemis Zemamra', 'نهضة الزمامرة',             false),
  ('CR Khemis Zemamra', 'الزمامرة',                  false),
  ('CR Khemis Zemamra', 'Zemamra',                   true)
),
-- Only clubs playing the current season. A club named in an old headline but
-- relegated out of the league gets nothing.
season_club as (
  select distinct team.id as team_id, team.name as team_name
  from app.teams team
  join app.team_memberships membership on membership.team_id = team.id
  join app.seasons season
    on season.id = membership.season_id and season.is_current
),
-- Arabic normalisation, applied identically to haystack and needle:
-- fold the hamza carriers أ إ آ ٱ onto ا, ى onto ي and ة onto ه, delete the
-- short-vowel marks and the tatweel, collapse runs of whitespace, lowercase.
-- Without it "حسنية أكادير" and "حسنية اكادير" are different strings.
edition_text as (
  select edition.story_id,
         regexp_replace(
           translate(lower(edition.title), 'أإآٱىةًٌٍَُِّْـ', 'اااايه'),
           '\s+', ' ', 'g'
         ) as needle
  from app.article_editions edition
),
matched as (
  select distinct headline.story_id, club.team_id
  from edition_text headline
  join club_alias alias
    on case
         when alias.latin then headline.needle ~ (
           '(^|[^[:alnum:]])'
           || regexp_replace(lower(alias.alias), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')
           || '($|[^[:alnum:]])'
         )
         else position(
           regexp_replace(
             translate(lower(alias.alias), 'أإآٱىةًٌٍَُِّْـ', 'اااايه'),
             '\s+', ' ', 'g'
           ) in headline.needle
         ) > 0
       end
  join season_club club on club.team_name = alias.team_name
)
select matched.story_id, matched.team_id from matched
on conflict (story_id, team_id) do nothing;
$seed$;

select extensions.is(
  (select count(*)::integer from app.story_teams),
  0,
  'fixture: story_teams starts empty, as production does'
);

call pg_temp.bg0082_seed_story_teams();

-- ---------------------------------------------------------------------
-- 1. Exactly one club — the case the crest branch fires on.
-- ---------------------------------------------------------------------
select extensions.is(
  (select count(*)::integer from app.story_teams
    where story_id = 'b8200082-0000-4000-8000-000000005001'),
  1,
  'a title naming one club produces exactly one story_teams row'
);

select extensions.is(
  (select team_id from app.story_teams
    where story_id = 'b8200082-0000-4000-8000-000000005001'),
  'b8200082-0000-4000-8000-00000000a002'::uuid,
  'and that one row is the club the title actually names'
);

-- ---------------------------------------------------------------------
-- 2. Two clubs — both are recorded, so the single-club branch declines.
-- ---------------------------------------------------------------------
select extensions.is(
  (select count(*)::integer from app.story_teams
    where story_id = 'b8200082-0000-4000-8000-000000005002'),
  2,
  'a title naming two clubs records both rather than guessing one'
);

select extensions.isnt(
  (select count(*)::integer from app.story_teams
    where story_id = 'b8200082-0000-4000-8000-000000005002'),
  1,
  'a two-club story therefore never yields a single-club result'
);

select extensions.bag_eq(
  $$select team_id from app.story_teams
    where story_id = 'b8200082-0000-4000-8000-000000005002'$$,
  $$values ('b8200082-0000-4000-8000-00000000a001'::uuid),
           ('b8200082-0000-4000-8000-00000000a002'::uuid)$$,
  'and the two rows are the two clubs the title names'
);

-- ---------------------------------------------------------------------
-- 3. No club at all.
-- ---------------------------------------------------------------------
select extensions.is(
  (select count(*)::integer from app.story_teams
    where story_id = 'b8200082-0000-4000-8000-000000005003'),
  0,
  'a title naming no club gets no row — "المغرب" alone is the country'
);

-- ---------------------------------------------------------------------
-- 4. A club outside the current season is never associated.
-- ---------------------------------------------------------------------
select extensions.is(
  (select count(*)::integer from app.story_teams
    where story_id = 'b8200082-0000-4000-8000-000000005004'),
  0,
  'a club with no current-season membership gets no association invented'
);

-- ---------------------------------------------------------------------
-- 5. The bare token الفتح is a foreign club, not FUS Rabat.
-- ---------------------------------------------------------------------
select extensions.is(
  (select count(*)::integer from app.story_teams
    where story_id = 'b8200082-0000-4000-8000-000000005005'),
  0,
  'the unqualified الفتح does not match FUS Rabat'
);

select extensions.is(
  (select count(*)::integer from app.story_teams),
  3,
  'across the fixture the seed writes exactly the three rows it should'
);

-- ---------------------------------------------------------------------
-- 6. Idempotence — a second run inserts nothing and touches nothing.
-- ---------------------------------------------------------------------
create temporary table bg0082_before as
select story_id, team_id, created_at from app.story_teams;

call pg_temp.bg0082_seed_story_teams();

select extensions.is(
  (select count(*)::integer from app.story_teams),
  3,
  're-running the seed inserts no new row'
);

select extensions.bag_eq(
  'select story_id, team_id, created_at from app.story_teams',
  'select story_id, team_id, created_at from bg0082_before',
  'and leaves every existing row, created_at included, untouched'
);

select * from extensions.finish();

rollback;
