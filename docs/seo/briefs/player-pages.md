# Brief: indexable player pages (SEO brief 3.3, 27 October 2026)

Page: `/fantasy/players/$playerId`, the only public player page (the Pepites
page is a separate product surface and keyed differently).

## What must be preserved

- The hero (club colours, first name over family name, price pill, crest), the
  four key numbers, next match, last six gameweeks, the football season
  section, upcoming fixtures, the action bar, follow and share.
- Fantasy rules, prices, points, the hydration fix (loader data seeds the
  queries so the server and the first browser render agree).
- The layout's reader-language title (`src/routes/fantasy.tsx`).

## Improvements

- The loader also reads the clubs and the player's season profile, so the
  server HTML carries the club, the colours and the season figures (they were
  client-only queries, so a crawler saw skeletons).
- The player's name is the page's one `h1` (the header bar's "Joueur" title is
  dropped; its kicker stays). The club in the hero links to the club page.
- Title "{Name} ({Club}) : stats, matchs et Fantasy | BotolaGO", description,
  self-canonical, `BreadcrumbList` and `Person` JSON-LD with `memberOf` the
  club. Nationality and age are not held, so they are not emitted.
- `/sitemaps/players.xml` lists the players of the current season's pool.
- The club squad tab links each player who is in the Fantasy pool to his page.

## Acceptance

- Server HTML (no JavaScript) holds name, club link, position, price, points
  and season figures, one `h1`, one canonical, two JSON-LD blocks.
- At 390 px and 1280 px, French and Arabic (RTL): no horizontal overflow, the
  header bar and hero unchanged apart from the missing bar title.
- `bunx tsc --noEmit`, eslint, prettier and the touched tests pass.
