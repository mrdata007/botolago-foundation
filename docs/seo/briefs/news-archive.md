# Brief: crawlable News archive (SEO brief, Bug 1)

Inspected: `/news` links about ten articles in its server HTML (the lead, top
stories and the first page of the feed); the rest of the 15.8k articles are
reachable only through "Voir plus d'articles", a button, or the sitemap. The
only paged read is a keyset feed (`api.news_feed`, 50 rows at most per call),
which cannot jump to page N, and no migration may be added.

## Preserved

- The `/news` hub as it is: title band, category chips, lead, top stories, club
  filter, the "Latest" feed and its "load more" button. Filters stay in the URL.
- The article page, its look and its data.
- News staying behind `NEWS_ENABLED` (redirect to Home while it is off).

## Improvements

- A new page, `/news/archive?page=N` (page 1 is `/news/archive`): 50 articles
  per page, newest first, each a plain link, with Précédent / Suivant and
  numbered page links in the server HTML. Page boundaries come from the
  sitemap snapshot (`api.news_sitemap_entries`), whose ordering matches the
  feed's, so the feed is read from the right cursor with no new database code.
- The hub links to the archive ("Toutes les actualités") under the feed.
- The article page puts its related articles in the server HTML (they loaded in
  the browser only); its club chips were already links in the server HTML.

## Acceptance

- `curl /news/archive?page=3` shows 50 article links and links to pages 2 and 4
  without JavaScript; each page's canonical is itself (page 1 is
  `/news/archive`); a page past the last is a 404; a failed read is a 503.
- At 390 px and 1280 px, French and Arabic (RTL): no horizontal overflow, the
  pagination wraps, the page numbers and arrows are at least 44 px tall.
- Existing News tests pass.
