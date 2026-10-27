# Internal links in the server HTML (SEO brief, no visible change)

Google has discovered about 9,165 botolago.com URLs it has not crawled. Part of
the fix is internal links that exist in the HTML the server sends, before any
JavaScript runs. Branch `claude/festive-volta-oochbu`. This is not a screen
redesign: no component, markup, style or copy changes.

## What must be preserved

- The club page and `/matches` look and behave exactly the same in French and
  Arabic. Same components, same markup, same styles, same copy.
- Client-side fetching still works: Arabic readers, `?season=` and tab changes,
  refetching and live updates load their data in the browser as today.
- A page never fails, 503s or 404s because of the extra reads. A failed or late
  extra read leaves the section to load on the client, as it does now.
- Fantasy, scoring, the gameweek lifecycle and every other business rule.
- The existing 404 (unknown club) and 503 (club read failed) behaviour.

## Improvements

A. `/clubs/<id>`: the loader also reads, in French, the season list, the club's
   matches for the season the page opens on, and (only while the News flag is
   on) the club's latest stories, in parallel with the club read. They are
   seeded into the page's own queries, so the first server render holds the
   `/matches/<id>` and `/news/<id>` links.
B. `/matches`: audit what the server HTML holds. The list is already seeded by
   the loader (audit A10); it has links on any day with fixtures. No change
   unless the audit finds a gap.
C. `/sitemap.xml`: list `/matches/<id>` for the directory's season (the default
   season), capped by `SITEMAP_MATCH_LIMIT`, reserved out of the News budget as
   `SITEMAP_CLUB_LIMIT` is. A failed football read leaves them out, never the
   sitemap.

## Acceptance criteria

- Server HTML of the reference club page
  (`0257feb3-4c16-431d-a58b-5faf060576ad`) contains `href="/news/..."` and
  `href="/matches/..."` links; before: none.
- Same page status (200) before and after; unknown id still 404.
- No hydration mismatch; before/after screenshots at 390px and 1280px, French
  and Arabic, show no visible difference beyond data arriving earlier.
- `/sitemap.xml` has `/matches/<id>` entries, at most 50,000 URLs in total
  (test), and still answers 200 when the football read fails (test).
- Response time of the club page does not grow by the sum of the reads: they
  run in parallel.
- `bun run typecheck`, eslint, prettier and the sitemap, services and routes
  tests pass.
