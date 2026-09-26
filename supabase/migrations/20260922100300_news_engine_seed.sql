-- BotolaGO News Engine — seed data.
--
-- Everything here is additive and re-runnable. The ElBotola source is created
-- DISABLED with article fetching UNAPPROVED: merging or deploying this
-- migration cannot start collection. Two separate, reviewed switches are
-- required, and both are documented in docs/production/NEWS_ENGINE_GO_LIVE.md.

-- ---------------------------------------------------------------------------
-- BotolaGO newsroom publisher
-- ---------------------------------------------------------------------------
--
-- Engine output is BotolaGO's own editorial work, so it is published under
-- BotolaGO's own publisher identity. The originating source keeps its
-- attribution in the private provenance tables, where administrators can
-- inspect it and the public API cannot reach it.

insert into app.publishers (slug, name, source_type, trust_status, ingestion_mode, website_url, active)
values ('botolago-newsroom', 'BotolaGO', 'internal', 'trusted', 'manual', 'https://botolago.com', true)
on conflict (slug) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  trust_status = excluded.trust_status,
  active = true,
  updated_at = statement_timestamp();

-- ---------------------------------------------------------------------------
-- Editorial taxonomy
-- ---------------------------------------------------------------------------

insert into app.taxonomies (taxonomy_type, slug, active, display_order) values
  ('category', 'latest', true, 10),
  ('category', 'transfers', true, 20),
  ('category', 'match-reports', true, 30),
  ('category', 'botola-pro', true, 40),
  ('category', 'national-team', true, 50),
  ('category', 'continental', true, 60),
  ('category', 'analysis', true, 70),
  ('category', 'interviews', true, 80),
  -- These are article tags, not topics. `app_private.news_article_card`
  -- builds a card's `tags` from taxonomy_type = 'tag', so seeding them as
  -- 'topic' would attach them to the story but never show them on a feed
  -- card -- the detail payload would list them and the card would look
  -- untagged.
  ('tag', 'injuries', true, 100),
  ('tag', 'suspensions', true, 110),
  ('tag', 'coaching', true, 120),
  ('tag', 'official-announcement', true, 130),
  ('tag', 'fixtures', true, 140),
  ('tag', 'throne-cup', true, 150)
on conflict (taxonomy_type, slug) do nothing;

insert into app.taxonomy_translations (taxonomy_id, language, display_name)
select taxonomy.id, seed.language::app.language_code, seed.display_name
from (values
  ('category', 'latest', 'fr', 'À la une'),
  ('category', 'latest', 'ar', 'آخر الأخبار'),
  ('category', 'transfers', 'fr', 'Transferts'),
  ('category', 'transfers', 'ar', 'الانتقالات'),
  ('category', 'match-reports', 'fr', 'Comptes rendus'),
  ('category', 'match-reports', 'ar', 'تقارير المباريات'),
  ('category', 'botola-pro', 'fr', 'Botola Pro'),
  ('category', 'botola-pro', 'ar', 'البطولة الاحترافية'),
  ('category', 'national-team', 'fr', 'Équipe nationale'),
  ('category', 'national-team', 'ar', 'المنتخب الوطني'),
  ('category', 'continental', 'fr', 'Compétitions africaines'),
  ('category', 'continental', 'ar', 'المنافسات الإفريقية'),
  ('category', 'analysis', 'fr', 'Analyses'),
  ('category', 'analysis', 'ar', 'تحليلات'),
  ('category', 'interviews', 'fr', 'Entretiens'),
  ('category', 'interviews', 'ar', 'حوارات'),
  ('tag', 'injuries', 'fr', 'Blessures'),
  ('tag', 'injuries', 'ar', 'الإصابات'),
  ('tag', 'suspensions', 'fr', 'Suspensions'),
  ('tag', 'suspensions', 'ar', 'العقوبات'),
  ('tag', 'coaching', 'fr', 'Entraîneurs'),
  ('tag', 'coaching', 'ar', 'الأطر التقنية'),
  ('tag', 'official-announcement', 'fr', 'Communiqué officiel'),
  ('tag', 'official-announcement', 'ar', 'بلاغ رسمي'),
  ('tag', 'fixtures', 'fr', 'Calendrier'),
  ('tag', 'fixtures', 'ar', 'برنامج المباريات'),
  ('tag', 'throne-cup', 'fr', 'Coupe du Trône'),
  ('tag', 'throne-cup', 'ar', 'كأس العرش')
) as seed(taxonomy_type, slug, language, display_name)
join app.taxonomies taxonomy
  on taxonomy.taxonomy_type = seed.taxonomy_type::app.taxonomy_type
  and taxonomy.slug = seed.slug
on conflict (taxonomy_id, language) do nothing;

-- ---------------------------------------------------------------------------
-- Publication policy
-- ---------------------------------------------------------------------------
--
-- LAUNCH MODE: every event type ships with auto_publish = false.
--
-- Every generated article therefore lands in `in_review` and waits for a human
-- to approve it in Admin. Nothing the engine produces reaches the public site
-- on its own, whatever mode the runner is invoked in.
--
-- `minimum_claim_status` and `minimum_source_count` still carry the reviewed
-- policy for each event type, and the notes say which ones are candidates for
-- auto-publish later. Turning one on is a deliberate one-row UPDATE by the
-- owner, recorded in docs/production/NEWS_ENGINE_GO_LIVE.md -- not a default.

insert into app_private.news_publication_policies (
  event_type, minimum_claim_status, minimum_source_count, auto_publish,
  require_resolved_entities, notes
) values
  ('match_result', 'official', 1, false, true,
   'Auto-publish candidate: a finished match with a confirmed scoreline is a matter of record.'),
  ('fixture_announcement', 'official', 1, false, true,
   'Auto-publish candidate: official scheduling from the competition organiser or club.'),
  ('official_signing', 'official', 1, false, true,
   'Auto-publish candidate: club or federation has formally announced the transfer.'),
  ('suspension', 'official', 1, false, true,
   'Auto-publish candidate: published disciplinary decision.'),
  ('competition_announcement', 'official', 1, false, true,
   'Auto-publish candidate: official communication from FRMF, CAF or the league.'),
  ('transfer_rumour', 'confirmed', 2, false, true,
   'Always reviewed. Two independent sources before it is even offered for review.'),
  ('injury', 'confirmed', 1, false, true,
   'Medical claims are reviewed; only club statements reach official status.'),
  ('coach_change', 'official', 1, false, true,
   'Reviewed even when official: wording carries reputational risk.'),
  ('contract_renewal', 'official', 1, false, true, 'Reviewed.'),
  ('club_statement', 'official', 1, false, true, 'Reviewed.'),
  ('preview', 'reported', 1, false, true, 'Editorial framing; always reviewed.'),
  ('analysis', 'reported', 1, false, true, 'Editorial framing; always reviewed.'),
  ('other', 'official', 2, false, true,
   'Unclassified events never auto-publish.')
on conflict (event_type) do nothing;

-- ---------------------------------------------------------------------------
-- ElBotola source
-- ---------------------------------------------------------------------------
--
-- Discovery uses the publisher's own Google News sitemap — a feed published
-- for automated consumers — in preference to scraping the homepage. The
-- article URL pattern is anchored to elbotola.com's article path so the
-- crawler cannot be walked onto another host by a malformed listing.
--
-- `enabled = false` and `article_fetch_approved = false`: this migration
-- records the configuration, it does not authorise collection.

insert into app_private.news_engine_sources (
  slug, name, hostname, publisher_id, source_kind, source_languages,
  discovery_method, discovery_url, article_url_pattern, allowed_media_hosts,
  enabled, priority, poll_interval_seconds, rate_limit_per_minute, max_concurrency,
  request_timeout_ms, max_retries, parser_version, article_fetch_approved,
  respect_robots, access_notes, config
)
select
  'elbotola',
  'ElBotola',
  'www.elbotola.com',
  publisher.id,
  'publisher',
  array['ar', 'fr'],
  'news_sitemap',
  'https://www.elbotola.com/sitemap-er987x.xml',
  '^https://www\.elbotola\.com/article/[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]+\.html$',
  array['images.elbotola.com', 'images2.elbotola.com'],
  false,
  10,
  1800,
  12,
  2,
  15000,
  2,
  'elbotola-v1',
  false,
  true,
  'Public-access only. Discovery reads the publisher''s own news sitemap; article pages are read '
  || 'only at the declared rate limit and only while robots.txt permits the article path. '
  || 'BotolaGO stores source text as internal extraction input and provenance, never as public '
  || 'copy, and never mirrors source photography. Owner permission evidence stays in the private '
  || 'legal record; see docs/backend/ELBOTOLA_INTEGRATION.md and '
  || 'docs/production/NEWS_ENGINE_GO_LIVE.md.',
  jsonb_build_object(
    'sitemapLanguageMap', jsonb_build_object(
      'ar', 'https://www.elbotola.com/sitemap-er987x-news-ar-1.xml',
      'fr', 'https://www.elbotola.com/sitemap-er987x-news-fr-1.xml'
    ),
    'userAgent', 'BotolaGO-NewsEngine/1.0 (+https://botolago.com)'
  )
from app.publishers publisher
where publisher.slug = 'elbotola'
on conflict (slug) do nothing;

insert into app_private.news_source_discovery_state (source_id)
select id from app_private.news_engine_sources where slug = 'elbotola'
on conflict (source_id) do nothing;

-- ---------------------------------------------------------------------------
-- Entity aliases
-- ---------------------------------------------------------------------------

-- Derive aliases from whatever the football catalog already knows: full name,
-- short name and code. Re-runnable, and a no-op on an empty catalog.
create or replace function app_private.news_engine_seed_catalog_aliases()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare inserted integer := 0;
begin
  with candidates as (
    select 'team'::app_private.news_entity_kind as kind, team.id as entity_id,
           unnest(array[team.name, team.short_name, team.code]) as alias, 1.0::real as confidence
    from app.teams team where team.active
    union all
    select 'player', player.id,
           unnest(array[player.full_name, player.display_name]), 1.0
    from app.players player where player.active
    union all
    select 'competition', competition.id,
           unnest(array[competition.name, competition.short_name]), 1.0
    from app.competitions competition where competition.active
    union all
    select 'competition', translation.competition_id, translation.display_name, 1.0
    from app.competition_translations translation
  ),
  normalized as (
    select kind, entity_id, btrim(alias) as alias,
           app_private.news_engine_normalize_name(alias) as normalized_alias, confidence
    from candidates
    where alias is not null and char_length(btrim(alias)) between 2 and 160
  ),
  written as (
    insert into app_private.news_entity_aliases (
      entity_kind, entity_id, alias, normalized_alias, confidence, origin
    )
    select distinct on (kind, normalized_alias, entity_id)
      kind, entity_id, alias, normalized_alias, confidence, 'catalog'
    from normalized
    where normalized_alias is not null and char_length(normalized_alias) >= 2
    on conflict (entity_kind, normalized_alias, entity_id) do nothing
    returning 1
  )
  select count(*) into inserted from written;

  return inserted;
end;
$$;

revoke all on function app_private.news_engine_seed_catalog_aliases()
from public, anon, authenticated, service_role;
grant execute on function app_private.news_engine_seed_catalog_aliases() to postgres;

create or replace function api.news_engine_reseed_aliases()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare added integer;
begin
  perform app_private.news_engine_require_service_role();
  added := app_private.news_engine_seed_catalog_aliases();
  return jsonb_build_object(
    'added', added,
    'total', (select count(*) from app_private.news_entity_aliases where active)
  );
end;
$$;

revoke all on function api.news_engine_reseed_aliases()
from public, anon, authenticated, service_role;
grant execute on function api.news_engine_reseed_aliases() to service_role;

select app_private.news_engine_seed_catalog_aliases();

-- Curated Arabic, French and abbreviated forms for the Botola Pro clubs.
-- These are the names Moroccan reporting actually uses; the catalog only
-- stores one Latin spelling each, so without this table "الوداد الرياضي" and
-- "Wydad AC" would resolve to nothing and the engine would file the story
-- with no club attached.
--
-- Matched on the catalog's canonical `name`, because team slugs carry a
-- provider-derived suffix that differs per environment.
insert into app_private.news_entity_aliases (
  entity_kind, entity_id, alias, normalized_alias, language, confidence, origin
)
select 'team', team.id, seed.alias,
       app_private.news_engine_normalize_name(seed.alias),
       seed.language, seed.confidence, 'seed'
from (values
  -- Wydad Athletic Club
  ('Wydad Casablanca', 'الوداد الرياضي', 'ar', 1.0),
  ('Wydad Casablanca', 'الوداد البيضاوي', 'ar', 1.0),
  ('Wydad Casablanca', 'الوداد', 'ar', 0.8),
  ('Wydad Casablanca', 'Wydad Athletic Club', 'fr', 1.0),
  ('Wydad Casablanca', 'Wydad AC', 'fr', 1.0),
  ('Wydad Casablanca', 'Wydad', 'fr', 0.8),
  ('Wydad Casablanca', 'WAC', 'fr', 0.7),
  -- Raja Club Athletic
  ('Raja Casablanca', 'الرجاء الرياضي', 'ar', 1.0),
  ('Raja Casablanca', 'الرجاء البيضاوي', 'ar', 1.0),
  ('Raja Casablanca', 'الرجاء', 'ar', 0.8),
  ('Raja Casablanca', 'Raja Club Athletic', 'fr', 1.0),
  ('Raja Casablanca', 'Raja CA', 'fr', 1.0),
  ('Raja Casablanca', 'Raja', 'fr', 0.8),
  ('Raja Casablanca', 'RCA', 'fr', 0.7),
  -- AS FAR
  ('FAR Rabat', 'الجيش الملكي', 'ar', 1.0),
  ('FAR Rabat', 'الجيش', 'ar', 0.7),
  ('FAR Rabat', 'AS FAR', 'fr', 1.0),
  ('FAR Rabat', 'ASFAR', 'fr', 1.0),
  ('FAR Rabat', 'FAR de Rabat', 'fr', 1.0),
  -- RS Berkane
  ('RSB Berkane', 'نهضة بركان', 'ar', 1.0),
  ('RSB Berkane', 'النهضة البركانية', 'ar', 1.0),
  ('RSB Berkane', 'Renaissance Berkane', 'fr', 1.0),
  ('RSB Berkane', 'RS Berkane', 'fr', 1.0),
  ('RSB Berkane', 'RSB', 'fr', 0.7),
  -- Maghreb de Fès
  ('Maghreb Fès', 'المغرب الفاسي', 'ar', 1.0),
  ('Maghreb Fès', 'Maghreb de Fès', 'fr', 1.0),
  ('Maghreb Fès', 'MAS Fès', 'fr', 1.0),
  ('Maghreb Fès', 'MAS', 'fr', 0.7),
  -- FUS Rabat
  ('FUS Rabat', 'الفتح الرباطي', 'ar', 1.0),
  ('FUS Rabat', 'الفتح', 'ar', 0.7),
  ('FUS Rabat', 'FUS de Rabat', 'fr', 1.0),
  ('FUS Rabat', 'Fath Union Sport', 'fr', 1.0),
  -- Difaâ Hassani El Jadidi
  ('Difaâ El Jadida', 'الدفاع الحسني الجديدي', 'ar', 1.0),
  ('Difaâ El Jadida', 'الدفاع الجديدي', 'ar', 1.0),
  ('Difaâ El Jadida', 'DHJ', 'fr', 0.8),
  ('Difaâ El Jadida', 'Difaa El Jadida', 'fr', 1.0),
  -- Hassania Agadir
  ('Hassania Agadir', 'حسنية أكادير', 'ar', 1.0),
  ('Hassania Agadir', 'الحسنية', 'ar', 0.7),
  ('Hassania Agadir', 'HUSA', 'fr', 0.8),
  -- Olympic Safi
  ('Olympic Safi', 'أولمبيك آسفي', 'ar', 1.0),
  ('Olympic Safi', 'أولمبيك اسفي', 'ar', 1.0),
  ('Olympic Safi', 'OC Safi', 'fr', 1.0),
  ('Olympic Safi', 'OCS', 'fr', 0.7),
  -- Ittihad Tanger
  ('Ittihad Tanger', 'اتحاد طنجة', 'ar', 1.0),
  ('Ittihad Tanger', 'IR Tanger', 'fr', 1.0),
  ('Ittihad Tanger', 'IRT', 'fr', 0.7),
  -- Moghreb Tétouan
  ('Moghreb Tétouan', 'المغرب التطواني', 'ar', 1.0),
  ('Moghreb Tétouan', 'MA Tétouan', 'fr', 1.0),
  ('Moghreb Tétouan', 'MAT', 'fr', 0.7),
  -- Chabab Mohammédia
  ('Chabab Mohammédia', 'شباب المحمدية', 'ar', 1.0),
  ('Chabab Mohammédia', 'SCCM', 'fr', 0.7),
  -- Kawkab Marrakech
  ('Kawkab Marrakech', 'الكوكب المراكشي', 'ar', 1.0),
  ('Kawkab Marrakech', 'KAC Marrakech', 'fr', 1.0),
  ('Kawkab Marrakech', 'KACM', 'fr', 0.8),
  -- CODM Meknès
  ('CODM Meknès', 'النادي القنيطري', 'ar', 0.5),
  ('CODM Meknès', 'الوداد المكناسي', 'ar', 0.6),
  ('CODM Meknès', 'CODM de Meknès', 'fr', 1.0),
  -- JS Soualem
  ('JS Soualem', 'شباب السوالم', 'ar', 1.0),
  ('JS Soualem', 'الجمعية السوالمية', 'ar', 0.9),
  ('JS Soualem', 'JSS', 'fr', 0.7),
  -- CR Khemis Zemamra
  ('CR Khemis Zemamra', 'نهضة الزمامرة', 'ar', 1.0),
  ('CR Khemis Zemamra', 'الزمامرة', 'ar', 0.8),
  ('CR Khemis Zemamra', 'RCA Zemamra', 'fr', 1.0),
  -- Union Touarga
  ('UTS Rabat', 'اتحاد تواركة', 'ar', 1.0),
  ('UTS Rabat', 'Union Touarga', 'fr', 1.0),
  ('UTS Rabat', 'UTS', 'fr', 0.7),
  -- Widad Témara
  ('Widad Témara', 'وداد تمارة', 'ar', 1.0),
  ('Widad Témara', 'Widad Temara', 'fr', 1.0),
  -- Olympique Dcheïra
  ('Olympique Dcheïra', 'أولمبيك الدشيرة', 'ar', 1.0),
  ('Olympique Dcheïra', 'Olympique Dcheira', 'fr', 1.0),
  -- Amal Tiznit
  ('Amal Tiznit', 'أمل تيزنيت', 'ar', 1.0),
  -- Yacoub El Mansour
  ('Yacoub El Mansour', 'يعقوب المنصور', 'ar', 1.0),
  ('Yacoub El Mansour', 'Youssoufia Rabat', 'fr', 0.6)
) as seed(team_name, alias, language, confidence)
join app.teams team on team.name = seed.team_name
where app_private.news_engine_normalize_name(seed.alias) is not null
on conflict (entity_kind, normalized_alias, entity_id) do nothing;

-- Competition aliases for the Moroccan and continental competitions the
-- relevance filter cares about, attached to whichever of them the catalog
-- already holds.
insert into app_private.news_entity_aliases (
  entity_kind, entity_id, alias, normalized_alias, language, confidence, origin
)
select 'competition', competition.id, seed.alias,
       app_private.news_engine_normalize_name(seed.alias),
       seed.language, seed.confidence, 'seed'
from (values
  ('Botola Pro', 'البطولة الاحترافية', 'ar', 1.0),
  ('Botola Pro', 'البطولة الوطنية الاحترافية', 'ar', 1.0),
  ('Botola Pro', 'البطولة', 'ar', 0.7),
  ('Botola Pro', 'Botola Pro Inwi', 'fr', 1.0),
  ('Botola Pro', 'Botola D1', 'fr', 0.9),
  ('Botola Pro', 'Championnat du Maroc', 'fr', 0.8)
) as seed(competition_name, alias, language, confidence)
join app.competitions competition
  on competition.name = seed.competition_name or competition.short_name = seed.competition_name
on conflict (entity_kind, normalized_alias, entity_id) do nothing;

comment on function api.news_engine_reseed_aliases() is
  'Rebuilds catalog-derived entity aliases after a football catalog import; curated aliases are untouched.';
