begin;

select extensions.no_plan();

select extensions.is(
  (select active from app.publishers where slug = 'newsdata'),
  false,
  'NewsData.io remains database-disabled until its activation canary is approved'
);
select extensions.is(
  (select trust_status::text from app.publishers where slug = 'newsdata'),
  'review_required',
  'NewsData.io never becomes trusted implicitly'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'api.news_ingest_provider_article(text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,integer,text)',
    'execute'
  ),
  'anonymous users cannot persist NewsData.io metadata'
);

-- Simulate a separately reviewed activation under the local database owner.
update app.publishers set active = true where slug = 'newsdata';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select extensions.is(
  api.news_ingest_provider_article(
    'newsdata',
    'newsdata-test-1',
    'https://publisher.example/botola-newsdata-one',
    repeat('a', 64),
    'fr',
    'Une actualité marocaine distribuée par NewsData',
    'Une description suffisamment longue pour le flux de nouvelles BotolaGO.',
    '<p>Une description suffisamment longue pour le flux de nouvelles BotolaGO.</p><p><a href="https://publisher.example/botola-newsdata-one" rel="nofollow noopener noreferrer">Lire l’article original sur Publisher Example</a></p>',
    'Publisher Example',
    'https://publisher.example/',
    'newsdata:newsdata-test-1:v1',
    statement_timestamp() - interval '1 hour',
    statement_timestamp() - interval '1 hour',
    1,
    'newsdata-excerpt-v1'
  ) ->> 'outcome',
  'inserted',
  'the first NewsData.io excerpt creates one attributed canonical article'
);

select extensions.is(
  api.news_ingest_provider_article(
    'newsdata',
    'newsdata-test-1',
    'https://publisher.example/botola-newsdata-one',
    repeat('a', 64),
    'fr',
    'Une actualité marocaine distribuée par NewsData',
    'Une description suffisamment longue pour le flux de nouvelles BotolaGO.',
    '<p>Une description suffisamment longue pour le flux de nouvelles BotolaGO.</p><p><a href="https://publisher.example/botola-newsdata-one" rel="nofollow noopener noreferrer">Lire l’article original sur Publisher Example</a></p>',
    'Publisher Example',
    'https://publisher.example/',
    'newsdata:newsdata-test-1:v1',
    statement_timestamp() - interval '1 hour',
    statement_timestamp() - interval '1 hour',
    1,
    'newsdata-excerpt-v1'
  ) ->> 'outcome',
  'skipped',
  'an identical NewsData.io retry is idempotently skipped'
);

select extensions.throws_ok(
  $$select api.news_ingest_provider_article(
    'newsdata', 'wrong-sanitizer', 'https://publisher.example/wrong-sanitizer', repeat('b', 64),
    'fr', 'Un article avec un mauvais contrat de nettoyage',
    'Une description suffisamment longue pour être rejetée par le contrat.',
    '<p>Une description suffisamment longue pour être rejetée par le contrat.</p><p><a href="https://publisher.example/wrong-sanitizer">Original</a></p>',
    'Publisher Example', 'https://publisher.example/', 'newsdata:wrong-sanitizer:v1',
    statement_timestamp(), statement_timestamp(), 1, 'gnews-excerpt-v1'
  )$$,
  '22023',
  null,
  'NewsData.io articles cannot claim another provider sanitizer contract'
);

reset role;

select extensions.is(
  (
    select publisher.trust_status::text
    from app.stories story
    join app.publishers publisher on publisher.id = story.publisher_id
    where story.canonical_url = 'https://publisher.example/botola-newsdata-one'
  ),
  'review_required',
  'the original publisher remains explicitly review-required'
);
select extensions.ok(
  (
    select publisher.slug like 'newsdata-source-%'
    from app.stories story
    join app.publishers publisher on publisher.id = story.publisher_id
    where story.canonical_url = 'https://publisher.example/botola-newsdata-one'
  ),
  'NewsData.io transport attribution is separated from the original publisher'
);
select extensions.is(
  (
    select count(*)::integer
    from app.article_editions
    where sanitizer_version = 'newsdata-excerpt-v1'
      and hero_asset_id is null
      and body_html !~* '<(img|script|iframe)([ >])'
  ),
  1,
  'NewsData.io stores one safe excerpt without unlicensed provider media'
);
select extensions.is(
  (
    select count(*)::integer
    from app_private.news_source_articles mapping
    join app.publishers publisher on publisher.id = mapping.publisher_id
    where publisher.slug = 'newsdata'
      and mapping.external_id = 'newsdata-test-1'
  ),
  1,
  'the provider identity mapping remains unique after a retry'
);

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select extensions.throws_ok(
  $$select api.news_ingest_provider_article(
    'newsdata', 'denied', 'https://publisher.example/denied', repeat('c', 64),
    'fr', 'Article interdit au client anonyme',
    'Description suffisamment longue pour déclencher le contrôle d’accès.',
    '<p>Description suffisamment longue pour déclencher le contrôle d’accès.</p><p><a href="https://publisher.example/denied">Original</a></p>',
    'Publisher Example', 'https://publisher.example/', 'newsdata:denied:v1',
    statement_timestamp(), statement_timestamp(), 1, 'newsdata-excerpt-v1'
  )$$,
  '42501',
  null,
  'anonymous clients cannot call NewsData.io persistence'
);

reset role;

select * from extensions.finish();
rollback;
