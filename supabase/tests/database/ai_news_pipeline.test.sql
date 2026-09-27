begin;
select extensions.no_plan();

select extensions.is((select draft_enabled::text from app_private.ai_news_settings where id), 'false',
  'draft creation defaults off until rights and runtime are reviewed');
select extensions.is((select auto_publish_enabled::text from app_private.ai_news_settings where id), 'false',
  'automatic publication has a separate off switch');

set local role anon;
select extensions.throws_ok($$select api.ai_news_configuration()$$, '42501', null,
  'an anonymous caller cannot inspect private pipeline configuration');
select extensions.throws_ok($$select api.ai_news_publish(repeat('a', 64))$$, '42501', null,
  'an anonymous caller cannot publish');
select extensions.throws_ok($$select api.ai_news_pending_publication()$$, '42501', null,
  'an anonymous caller cannot inspect pending publication');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"96000000-0000-4000-8000-000000000001","aal":"aal2"}', true);
select extensions.throws_ok($$select api.ai_news_publish(repeat('a', 64))$$, '42501', null,
  'even an MFA authenticated caller cannot use the service publisher');
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.throws_ok($$select api.ai_news_publish(repeat('a', 64))$$,
  '42501', 'ai_news_auto_publish_disabled', 'service role cannot publish while the switch is off');
reset role;

update app_private.ai_news_settings set draft_enabled = true, source_processing_approved = true where id;

select set_config('test.ai_payload', jsonb_build_object(
  'candidate', jsonb_build_object(
    'sourceId', 'elbotola:12345', 'url', 'https://www.elbotola.com/article/2026-09-27-10-00-12345.html',
    'outlet', 'ElBotola', 'title', 'Une décision du club', 'language', 'fr', 'competition', 'botola-pro-inwi',
    'publishedAt', statement_timestamp() - interval '1 hour', 'retrievedAt', statement_timestamp(),
    'facts', jsonb_build_array(
      jsonb_build_object('id', 'f1', 'text', 'Le club a annoncé sa décision.', 'sourceUrl', 'https://www.elbotola.com/article/2026-09-27-10-00-12345.html', 'outlet', 'ElBotola'),
      jsonb_build_object('id', 'f2', 'text', 'Le calendrier suivra.', 'sourceUrl', 'https://www.elbotola.com/article/2026-09-27-10-00-12345.html', 'outlet', 'ElBotola'))),
  'article', jsonb_build_object(
    'headline', 'Le club annonce une décision concernant son équipe',
    'excerpt', 'Selon ElBotola, le club a communiqué une décision concernant son équipe.',
    'seoTitle', 'Décision annoncée par le club',
    'seoDescription', 'ElBotola rapporte une nouvelle décision du club concernant son équipe.'),
  'html', '<p>ElBotola rapporte une décision concernant le club et son équipe. <a href="https://www.elbotola.com/article/2026-09-27-10-00-12345.html">ElBotola</a></p>',
  'quality', 'passed', 'reasons', jsonb_build_array(), 'sanitizerVersion', 'sanitize-html@2.17.5',
  'promptVersion', 'ai-news-v1', 'modelProvider', 'openai', 'modelName', 'test-model')::text, true);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.throws_ok(
  $$select api.ai_news_save_draft(repeat('a', 64), current_setting('test.ai_payload')::jsonb)$$,
  '22023', 'ai_news_invalid_draft', 'unapproved source cannot create a draft');
reset role;

update app_private.ai_news_source_permissions set ai_processing_approved = true where outlet = 'ElBotola';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.ai_news_save_draft(repeat('a', 64), current_setting('test.ai_payload')::jsonb)->>'created', 'true',
  'a service call creates a private draft after both draft gates are enabled');
select extensions.is(api.ai_news_save_draft(repeat('a', 64), current_setting('test.ai_payload')::jsonb)->>'created', 'false',
  'a retried save returns the same draft');
select extensions.throws_ok($$select api.ai_news_publish(repeat('a', 64))$$,
  '42501', 'ai_news_auto_publish_disabled', 'publication remains disabled after draft enablement');
reset role;

select extensions.is((select count(*)::text from app_private.ai_news_drafts where candidate_key = repeat('a', 64)), '1',
  'idempotent retry stores one provenance record');
select extensions.is((select status::text from app.article_editions where id =
  (select edition_id from app_private.ai_news_drafts where candidate_key = repeat('a', 64))), 'draft',
  'saved article remains private draft');

update app_private.ai_news_settings set auto_publish_enabled = true where id;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.throws_ok($$select api.ai_news_publish(repeat('a', 64))$$,
  '22023', 'ai_news_independent_sources_required',
  'one licensed outlet is insufficient for unattended publication');
reset role;

-- Synthetic second-source permission exists only inside this rolled-back test.
insert into app_private.ai_news_source_permissions (
  outlet, origin, ai_processing_approved, auto_publication_approved
) values ('Official Test Club', 'https://example.org', true, true);
update app_private.ai_news_source_permissions set auto_publication_approved = true where outlet = 'ElBotola';
update app_private.ai_news_settings set daily_limit = 2 where id;
select set_config('test.ai_payload_two_sources',
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(current_setting('test.ai_payload')::jsonb, '{candidate,sourceId}', '"elbotola:12346"'),
            '{candidate,url}', '"https://www.elbotola.com/article/2026-09-27-10-00-12346.html"'),
          '{candidate,facts,0,sourceUrl}', '"https://www.elbotola.com/article/2026-09-27-10-00-12346.html"'),
        '{candidate,facts,1}', jsonb_build_object(
          'id', 'f2', 'text', 'The club published a matching official announcement.',
          'sourceUrl', 'https://example.org/news/club-announcement', 'outlet', 'Official Test Club')),
      '{html}', to_jsonb(replace(current_setting('test.ai_payload')::jsonb->>'html', '12345', '12346'))),
    '{candidate,title}', '"A second reported club decision"')::text,
  true);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.ai_news_save_draft(repeat('b', 64), current_setting('test.ai_payload_two_sources')::jsonb)->>'created', 'true',
  'approved independently sourced reporting can be drafted');
select extensions.is(api.ai_news_pending_publication()::text, jsonb_build_array(repeat('b', 64))::text,
  'an eligible saved draft is available for retry');
select extensions.is(api.ai_news_publish(repeat('b', 64))->>'published', 'true',
  'service publication requires both flags and two approved outlets');
select extensions.is(api.ai_news_pending_publication()::text, '[]',
  'a published draft is removed from pending retries');
select extensions.is(api.ai_news_publish(repeat('b', 64))->>'published', 'false',
  'publication retry is idempotent');
reset role;
select extensions.is((select count(*)::text from app_private.editorial_audit_events
  where event_type = 'ai_article_published' and article_edition_id =
    (select edition_id from app_private.ai_news_drafts where candidate_key = repeat('b', 64))), '1',
  'publication retry leaves one audit event');

update app_private.ai_news_settings set daily_limit = 0 where id;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.is(api.ai_news_pending_publication()::text, '[]',
  'zero daily limit disables pending automatic publication');
reset role;

update app_private.ai_news_settings set daily_limit = 2 where id;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select extensions.throws_ok(
  $$select api.ai_news_save_draft(repeat('c', 64), current_setting('test.ai_payload')::jsonb)$$,
  '22023', 'ai_news_daily_limit_reached', 'database enforces the daily ceiling');
reset role;

select * from extensions.finish();
rollback;
