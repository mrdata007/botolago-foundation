-- BotolaGO — BG-0082: give the News cards a club to draw a crest for.
--
-- app.story_teams holds 0 rows against 108 stories. BG-0076 added
-- src/components/common/ArticleHeroFallback.tsx, which paints a branded plate
-- where a hero photo would be and puts the club crest on that plate when the
-- edition names EXACTLY ONE club. That branch reads `story_teams`, so on live
-- data it has never once fired: every plate in production is wordmark-only.
--
-- This migration is the missing data, not a behaviour change. It is worth
-- being explicit about what it does and does not buy today:
--
--   * NEWS_ENABLED in src/lib/feature-flags.ts is false, and
--     20260921170000_news_stand_down.sql moves every published edition to
--     'unpublished'/'private'. So there is no user-visible effect from this
--     migration at launch. It pays off the day News is switched back on, and
--     it was built to be correct rather than quick for exactly that reason.
--   * The 108 stories are machine-ingested third-party link-out stubs with
--     short bodies. Their TITLES are the only reliable signal about which club
--     they concern, so the title is the only text this migration reads.
--
-- ---------------------------------------------------------------------------
-- Why an alias list rather than app.teams.name
-- ---------------------------------------------------------------------------
-- 98 of the 108 editions are Arabic; 10 are French. Every value in
-- app.teams.name is Latin ("Wydad Casablanca", "Maghreb Fès"), so matching
-- app.teams.name against the corpus would find almost nothing: an Arabic
-- headline says "الوداد الرياضي", never "Wydad Casablanca".
--
-- app.team_translations (20260921190000_team_translations.sql) is the right
-- long-term home for the Arabic forms, but it ships EMPTY pending owner
-- confirmation of the names, and at the time of writing it does not exist in
-- production at all. This migration therefore does NOT read it — depending on
-- a table that is empty by design would mean seeding nothing. The aliases are
-- carried here instead, as data this migration owns. If and when
-- team_translations is seeded, a later migration can widen the match; nothing
-- here conflicts with that, because the insert is idempotent.
--
-- ---------------------------------------------------------------------------
-- What is deliberately NOT matched
-- ---------------------------------------------------------------------------
-- app.teams.code and app.teams.short_name are never used. Production shows why
-- a short-code match against free text would be reckless:
--
--   * Wydad Casablanca carries short_name = 'WCA' — a literal code, not a name;
--   * CR Khemis Zemamra carries code = 'RCAZ', which disagrees with its own
--     name;
--   * a two- or three-letter token ('MAS', 'FAR', 'RCA', 'MAT', 'FUS') occurs
--     inside ordinary French and Arabic words and inside foreign clubs' names.
--
-- Every alias below is a full club name or an unambiguous multi-word form.
-- One trap is worth naming: FUS Rabat is "الفتح الرباطي" / "الفتح الرياضي" in
-- Arabic, and the corpus contains a headline about the SAUDI club الفتح. The
-- bare token "الفتح" is therefore NOT an alias — only the qualified forms are.
-- The same logic keeps "المغرب" (which means Morocco) out, in favour of
-- "المغرب الفاسي" and "المغرب التطواني".
--
-- ---------------------------------------------------------------------------
-- Ambiguity policy: record BOTH clubs, never guess one
-- ---------------------------------------------------------------------------
-- When a title names two clubs ("الوداد يختتم تحضيراته .. أمام المغرب
-- التطواني") both rows are written. That is chosen over writing neither
-- because both rows are TRUE — the story really is about both clubs — and
-- because the crest branch keys off `clubIds.length === 1`, so two rows make
-- it decline on its own. Recording both therefore costs the crest nothing and
-- gains the team filter (api.news_team_filters) and the search document
-- (app_private.refresh_story_search_trigger, which fires on this table) a
-- correct association. Writing neither would have thrown that away to buy the
-- same crest behaviour.
--
-- ---------------------------------------------------------------------------
-- Scope and idempotence
-- ---------------------------------------------------------------------------
-- Only the 16 clubs with a current-season row in app.team_memberships are
-- eligible; relegated clubs get no association invented for them. The insert
-- is `on conflict do nothing` on the natural key (story_id, team_id), which is
-- the table's primary key, so re-running this migration inserts nothing new
-- and fires no trigger.
--
-- Verified read-only against production before writing: 17 stories match
-- exactly one club, 3 match two, 88 match none, for 23 rows seeded. The full
-- matched set was reviewed row by row; see
-- docs/engineering/tasks/BG-0082/verification-report.yaml.

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
