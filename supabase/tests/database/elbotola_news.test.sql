begin;

select extensions.no_plan();

select extensions.is(
  (select active from app.publishers where slug = 'elbotola'),
  false,
  'ElBotola remains database-disabled until syndication approval is recorded'
);
select extensions.is(
  (select trust_status::text from app.publishers where slug = 'elbotola'),
  'review_required',
  'ElBotola never becomes trusted implicitly'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'api.news_ingest_provider_article(text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,integer,text)',
    'execute'
  ),
  'anonymous users cannot persist ElBotola metadata'
);

-- Simulate the separately reviewed publisher-activation migration under the
-- local database owner. The runtime service role intentionally cannot do this.
update app.publishers set active = true where slug = 'elbotola';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select extensions.is(
  api.news_ingest_provider_article(
    'elbotola',
    '2026-08-03-20-42-503',
    'https://www.elbotola.com/article/2026-08-03-20-42-503.html',
    repeat('c', 64),
    'ar',
    'خبر موثوق عن منافسات البطولة الاحترافية المغربية',
    'خبر منشور على موقع البطولة. افتح المصدر الأصلي لقراءة التفاصيل.',
    '<p>خبر منشور على موقع البطولة. افتح المصدر الأصلي لقراءة التفاصيل.</p><p><a href="https://www.elbotola.com/article/2026-08-03-20-42-503.html" rel="nofollow noopener noreferrer">اقرأ المقال الأصلي على البطولة</a></p>',
    'ElBotola',
    'https://www.elbotola.com/',
    'elbotola:2026-08-03-20-42-503:v1',
    statement_timestamp() - interval '1 hour',
    statement_timestamp() - interval '1 hour',
    1,
    'elbotola-link-v1'
  ) ->> 'outcome',
  'inserted',
  'the first ElBotola link creates one attributed canonical article'
);

select extensions.is(
  api.news_ingest_provider_article(
    'elbotola',
    '2026-08-03-20-42-503',
    'https://www.elbotola.com/article/2026-08-03-20-42-503.html',
    repeat('c', 64),
    'ar',
    'خبر موثوق عن منافسات البطولة الاحترافية المغربية',
    'خبر منشور على موقع البطولة. افتح المصدر الأصلي لقراءة التفاصيل.',
    '<p>خبر منشور على موقع البطولة. افتح المصدر الأصلي لقراءة التفاصيل.</p><p><a href="https://www.elbotola.com/article/2026-08-03-20-42-503.html" rel="nofollow noopener noreferrer">اقرأ المقال الأصلي على البطولة</a></p>',
    'ElBotola',
    'https://www.elbotola.com/',
    'elbotola:2026-08-03-20-42-503:v1',
    statement_timestamp() - interval '1 hour',
    statement_timestamp() - interval '1 hour',
    1,
    'elbotola-link-v1'
  ) ->> 'outcome',
  'skipped',
  'an identical ElBotola retry is idempotently skipped'
);

reset role;

select extensions.is(
  (
    select publisher.slug
    from app.stories story
    join app.publishers publisher on publisher.id = story.publisher_id
    where story.canonical_url = 'https://www.elbotola.com/article/2026-08-03-20-42-503.html'
  ),
  'elbotola',
  'the canonical story is directly attributed to ElBotola'
);
select extensions.is(
  (
    select count(*)::integer
    from app.publishers
    where slug like 'elbotola-source-%'
  ),
  0,
  'the direct publisher does not create a duplicate transport source'
);
select extensions.is(
  (
    select count(*)::integer
    from app.article_editions
    where sanitizer_version = 'elbotola-link-v1'
      and body_html !~* '<(img|script|iframe)([ >])'
  ),
  1,
  'the stored edition contains only sanitized link metadata'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select extensions.throws_ok(
  $$select api.news_ingest_provider_article(
    'elbotola', 'wrong-language',
    'https://www.elbotola.com/article/2026-08-03-19-32-411.html', repeat('d', 64),
    'fr', 'Titre français non autorisé pour cette source',
    'Description suffisamment longue pour déclencher la validation.',
    '<p>Description suffisamment longue pour déclencher la validation.</p><p><a href="https://www.elbotola.com/article/2026-08-03-19-32-411.html">Original</a></p>',
    'ElBotola', 'https://www.elbotola.com/', 'elbotola:wrong-language:v1',
    statement_timestamp(), statement_timestamp(), 1, 'elbotola-link-v1'
  )$$,
  '22023',
  null,
  'ElBotola metadata cannot claim an unsupported language'
);
select extensions.throws_ok(
  $$select api.news_ingest_provider_article(
    'elbotola', 'wrong-origin', 'https://copy.example/article/2026-08-03.html', repeat('e', 64),
    'ar', 'خبر من عنوان غير مسموح به في نظام الأخبار',
    'خبر منشور على موقع البطولة. افتح المصدر الأصلي لقراءة التفاصيل.',
    '<p>خبر منشور على موقع البطولة. افتح المصدر الأصلي لقراءة التفاصيل.</p><p><a href="https://copy.example/article/2026-08-03.html">المصدر</a></p>',
    'ElBotola', 'https://www.elbotola.com/', 'elbotola:wrong-origin:v1',
    statement_timestamp(), statement_timestamp(), 1, 'elbotola-link-v1'
  )$$,
  '22023',
  null,
  'ElBotola metadata cannot redirect canonical attribution to another origin'
);

reset role;

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select api.news_ingest_provider_article(
    'elbotola', 'denied',
    'https://www.elbotola.com/article/2026-08-03-19-32-411.html', repeat('f', 64),
    'ar', 'خبر محظور على المستخدم المجهول',
    'خبر منشور على موقع البطولة. افتح المصدر الأصلي لقراءة التفاصيل.',
    '<p>خبر منشور على موقع البطولة. افتح المصدر الأصلي لقراءة التفاصيل.</p><p><a href="https://www.elbotola.com/article/2026-08-03-19-32-411.html">المصدر</a></p>',
    'ElBotola', 'https://www.elbotola.com/', 'elbotola:denied:v1',
    statement_timestamp(), statement_timestamp(), 1, 'elbotola-link-v1'
  )$$,
  '42501',
  null,
  'anonymous clients cannot call ElBotola persistence'
);
reset role;

select * from extensions.finish();
rollback;
