# League hubs (SEO brief 3.4)

Branch `seo/league-hubs`. Screen work under AGENTS.md "Screen work".

## What was found first

| Page in the brief                              | Decision  | Why                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/buteurs` (top scorers)                       | Not built | No read gives goals per player for the league. `fantasy_top_players` reports points and minutes only (`goals: null`), the Pépites ranking covers only its own young-player pool, and the club squad read has no season goals. A scorers table needs a read (an aggregate over match events), which is a migration. |
| `/derby-casablanca`, `/classico-wac-far`       | Built     | The club fixture read (`getTeamFixtures`) pages every fixture of a club back through the seasons, so the next meeting and past results between two clubs come from an existing read.                                                                                                                               |
| `/calendrier`, `/botola-pro`                   | 301       | To `/matches` and `/`.                                                                                                                                                                                                                                                                                             |
| "où regarder" (broadcast), "billets" (tickets) | Skipped   | The site holds no broadcast or ticket data. Not invented.                                                                                                                                                                                                                                                          |

## Preserved

The app shell, title band, match rows (`MatchCard`) and club crests are reused
as they are. No existing screen changes; the two pages are new.

## Improvements

- Two public, server-rendered pages: clubs linked, next meeting, past results
  (each row links to its match page), a short factual intro with no history.
- Clubs are found by stable identity (slug stem, else name), never a UUID.
- Title, description, H1, self-canonical, breadcrumb JSON-LD; in the sitemap.

## Acceptance

- Server HTML carries the H1, both club links, and the match links.
- 390 px and 1280 px, French and Arabic (RTL): no horizontal overflow.
- A page whose clubs cannot be found, or whose read fails, is a 404 / 503 and
  not an empty indexable 200.
