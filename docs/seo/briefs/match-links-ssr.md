# Brief: match links in the server HTML (SEO pass 1)

Screen work under AGENTS.md "Screen work". Branch `seo/match-links-ssr`.

## Finding

The live HTML of `/matches` and of a club page held no `href="/matches/<id>"`.
`/matches` already prefetches its opening day on the server; on 27 Oct 2026
that day is empty ("Aucun match programmé"), so the HTML held two links to
other days and no match. Club pages loaded the season and the club's fixtures
only in the browser.

## Preserved

- The page opens on today by the competition's calendar; the empty state, its
  two day links, the date band, chips, tabs and live strip are unchanged.
- A day with matches paints exactly as before.
- Club page: hero, tabs, sections, copy and order unchanged. Its 404/503 rules
  stay (a failed fixtures read leaves the existing skeletons, no new 503).
- Fantasy rules, scoring, gameweek lifecycle: untouched.

## Improvements

1. `/matches`, empty opening day: below the empty state, the matches of the
   next match day as ordinary match rows (`/matches/<id>` links), headed by the
   existing "Prochains matchs : <date>" string. Server-rendered from the Home
   upcoming query, seeded to the browser through the router's dehydrate step.
2. Club page: the loader prefetches the seasons and the club's fixtures for the
   season on show (French), so the next match and latest results, with their
   links, are in the HTML and the browser's first render matches.

## Acceptance

- `curl` of `/matches` (empty day) and `/clubs/<id>` shows `href="/matches/<uuid>"`.
- No hydration error in the console, French and Arabic.
- No horizontal overflow at 390px and desktop, RTL included.
- `matches-calendar*.test.ts(x)` and club page tests pass.
