-- BotolaGO Production V2
-- News: ordered indexes so the feed and home rails stop at the first page.
--
-- The public reads filter with app_private.news_is_public(edition), which
-- cannot be inlined (it has SET search_path), so the planner cannot use the
-- partial feed index (its predicate names status, which the query does not).
-- With no other index in (language, published_at) order it read every
-- edition of the language, called news_is_public on each and sorted: after
-- the licensed ElBotola import (13,212 Arabic editions) api.news_feed('ar')
-- took ~9 s, past the 3 s statement timeout PostgREST gives the anon role.
--
-- With these two indexes the planner walks editions newest-first and stops
-- once it has a page. Measured against production data in a rolled-back
-- transaction (2026-09-24): news_feed ar 9.0 s -> 44 ms, fr 1.4 s -> 21 ms,
-- news_home_modules fr 1.1 s -> 9 ms, news_article_detail 77 -> 16 ms.

create index if not exists article_editions_language_published_idx
  on app.article_editions (language, published_at desc, id desc);

create index if not exists article_editions_published_idx
  on app.article_editions (published_at desc, id desc);
