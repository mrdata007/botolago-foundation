# Public cached endpoints (design)

Status: design, 2026-09-26. Nothing here is built yet. Production V2 and
Legacy are unchanged.

## Why

Measured on 2026-09-26 (`docs/backend/SCALE_AND_COST_REPORT.md` has the
numbers and how they were taken):

- Every page reads shared data (news, fixtures, scores, the league table, the
  player catalogue, rankings) straight from the browser to
  `https://<project>.supabase.co/rest/v1/rpc/*`. Those calls are `POST`, and
  once someone is signed in they carry that person's token. Nothing in
  between can cache them. Every visitor's request therefore reaches the one
  database machine.
- On that machine the API layer (PostgREST), not Postgres, uses most of the
  CPU. A request with a token PostgREST has not seen recently costs it about
  **14 ms** to verify: Supabase issues ES256 tokens, and PostgREST's cache
  holds 1,000 of them. A request sent with only the publishable key costs
  **about 1 ms**, because that one anonymous token is always cached.
- A live match page re-reads 7 RPCs every 30 seconds per viewer. The data
  behind it changes every 2 minutes at most (`football-live-refresh`).
  Fantasy rankings read the whole board 100 rows at a time, up to 20 requests
  per view.

Putting a CDN in front of `botolago.com` alone changes none of this. The
browser does not fetch this data from `botolago.com`. It calls
`supabase.co` directly, with `POST` and often an `Authorization` header, and
shared caches do not store that.

## The rule

Shared data moves to `GET` endpoints on the site's own origin under
`/api/public/`. The web app reads it from there with a plain `fetch`, sending
no credentials. Each endpoint calls Supabase **as anonymous only**, so its
answer is the same for everyone, and says so in its headers.

Everything that belongs to one person stays exactly as it is: uncached,
direct, and with the person's token. That covers the Fantasy team, transfers,
chips, lineups, leagues, predictions entries, saved articles, profile,
notifications and every mutation. These keep going to Supabase directly,
checked by the database for MFA, ownership, idempotency, version and deadline.
`withSiteHeaders` keeps forcing `private, no-store` on `/fantasy/*`,
`/profile`, `/pronostics/ligues` and the rest.

## Endpoints

Freshness is how old an answer may be when a visitor sees it. The cache
headers are derived from it: `max-age` for browsers, `s-maxage` for shared
caches, and always `stale-if-error=86400`.

| Path (GET)                                                  | Source (called as anon)                                                                                | Freshness                             | Notes                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/api/public/football/live?lang=`                           | `football_live_matches`                                                                                | 20 s                                  | Upstream refresh is 2 min at best                                                                                     |
| `/api/public/football/home?lang=`                           | `football_home_matches`                                                                                | 30 s                                  |                                                                                                                       |
| `/api/public/football/day/{date}?season=&lang=`             | `football_matches_by_date`                                                                             | 30 s on a match day, 10 min otherwise |                                                                                                                       |
| `/api/public/football/match/{id}?lang=`                     | the 7 `football_match_*` RPCs, bundled into one answer                                                 | 20 s while live, 1 h once finished    | One request replaces 7                                                                                                |
| `/api/public/football/standings/{season}?lang=`             | new snapshot RPC: the table computed on the server (today the browser pages fixtures and computes it)  | 60 s on match days                    | One request replaces about 5                                                                                          |
| `/api/public/football/catalog?lang=`                        | `football_season_catalog`, `football_team_catalog`                                                     | 1 h                                   |                                                                                                                       |
| `/api/public/football/club/{id}?lang=`                      | `football_team_summary`, `football_team_squad`, `football_team_fixtures`                               | 10 min                                |                                                                                                                       |
| `/api/public/fantasy/state`                                 | new RPC: the global part of `fantasy_hub` (season, gameweek, enrolment, `rankingAvailable`), no `team` | 30 s                                  | The hub as anon already has `team: null`, but a dedicated RPC removes the risk of a signed-in call ever filling it    |
| `/api/public/fantasy/players?season=`                       | new snapshot RPC: the whole pool plus season stats in one answer                                       | 5 min                                 | Today up to 21 requests                                                                                               |
| `/api/public/fantasy/top?gw=`, `/fixture-difficulty`        | `fantasy_top_players`, `fantasy_gameweek_summary`, `fantasy_fixture_difficulty`                        | 5 min                                 |                                                                                                                       |
| `/api/public/fantasy/standings?season=&page=`               | new snapshot table of the overall board (team names only), rebuilt when rankings are recomputed        | 5 min                                 | `myRank` stays a separate authenticated call. Anonymous `managerName` is the team name, so no display name can leak   |
| `/api/public/fantasy/leagues/{id}/standings?page=`          | `fantasy_league_standings` as anon                                                                     | 5 min                                 | Public leagues only. The endpoint refuses a private league (404) and never serves one from cache                      |
| `/api/public/predictions/round?n=&lang=`                    | `predictions_round` as anon                                                                            | 60 s                                  | Only while predictions mode is `public`. In `testers` mode the endpoint answers `no-store`, and testers read directly |
| `/api/public/predictions/leaderboard?scope=&round=&cursor=` | `predictions_leaderboard` as anon (`me` null)                                                          | 5 min (the score tick)                | Same mode rule                                                                                                        |
| `/api/public/news/home?lang=`                               | `news_home_modules`                                                                                    | 2 min                                 | `isSaved` is always false as anon; saved marks come from `news_saved_articles`                                        |
| `/api/public/news/feed?lang=&team=&cursor=`                 | `news_feed`                                                                                            | 2 min                                 | The same 5-minute unpublish budget the sitemap promises                                                               |
| `/api/public/news/article/{idOrSlug}?lang=`                 | `news_article_detail` + `news_related_articles`                                                        | 2 min                                 |                                                                                                                       |
| `/api/public/news/teams?lang=`                              | `news_team_filters`                                                                                    | 10 min                                |                                                                                                                       |

## How each endpoint is built

1. **A server `GET` handler** (`createFileRoute(...).server.handlers.GET`, the
   way `/sitemap.xml` is built). Not a server function: those are `POST` and
   carry the caller's token through `attachSupabaseAuth`.
2. **Its own anonymous client**, `persistSession: false` and
   `autoRefreshToken: false`, sending the publishable key and no
   `Authorization`. The request's own `Authorization` and cookies are
   ignored. The shared server `supabase` singleton is not used, so no session
   can ever leak into it.
3. **Parameters from an allow-list.** Each endpoint names its parameters and
   their formats (uuid, `fr|ar`, ISO date, bounded page number). Anything else
   gets a 400 with `no-store`. The cache key is the canonical path plus the
   sorted parameters, so `?lang=fr&x=1` cannot create a new cache entry.
4. **Headers:**
   - `Cache-Control: public, max-age=<browser>, s-maxage=<edge>, stale-while-revalidate=<same>, stale-if-error=86400`
   - `CDN-Cache-Control` with the same edge lifetime, which Cloudflare reads
     for its own caching
   - `Vary: Accept-Encoding` only
   - no `Set-Cookie`

   Errors use the sitemap's pattern: 503, `no-store`, `retry-after`. An empty
   answer that should not be empty (for example, no season) is an error, not
   something to cache.

5. **Three layers, so that correctness never depends on the CDN:**
   - **Edge.** The site runs as a Cloudflare Worker through Lovable, and
     Cloudflare does not cache Worker responses by default. The handler uses
     the Workers Cache API (`caches.default`) keyed by the canonical URL,
     where it is available, and falls back to a short in-isolate memo
     (≤ freshness, ≤ 200 entries).
   - **Database snapshots** for the expensive aggregates: the standings
     table, the overall board, the player pool. These follow
     `news_sitemap_snapshot` (migration 20260926003050): a pg_cron job
     recomputes a small table, the RPC serves it while it is fresh and
     computes live otherwise, and an ops health check watches its age. Each
     request that does reach the database is then cheap.
   - **CDN headers.** Where Cloudflare or Lovable honour them, most requests
     never reach the Worker at all.

## Web app changes

- The repositories for news, football, catalogue, standings, Fantasy state,
  players and rankings get a "public" reader that calls `/api/public/...` with
  `fetch`, `credentials: "omit"`.
- The personal overlays stay separate, small and authenticated, each read
  once per screen and not polled:
  - `news_saved_articles` for the "saved" marks
  - `myRank` for the rankings page
  - `me` for predictions
  - the caller's own team, through the owned-Fantasy snapshot
- The server render of public pages (`prefetchForSsr`) reads the same
  endpoints' logic in-process, so it shares the edge cache.
- Polling (the live strip, the match page) hits the cached endpoints. Every
  viewer's 30-second poll then costs the database at most one request per
  freshness window per edge location, not one per viewer.

## Verification before switching the app over

- **Contract tests:**
  - every public endpoint returns the same bytes with and without an
    `Authorization` header;
  - no response contains `isSaved: true`, a display name, `myRank`, `me` or
    `team`;
  - a private league id answers 404.
- **Header tests:** `Cache-Control` on every endpoint; `no-store` on every
  error and on every `/fantasy/*` page.
- **On the live host,** before relying on the edge:
  `curl -sI https://botolago.com/api/public/football/live?lang=fr` twice,
  checking `cf-cache-status` (HIT on the second call) and `age`. If Lovable's
  hosting does not cache, the in-Worker cache and the snapshots still carry
  the load, and the report must say so.
- **Load:** the browsing workload (`scripts/backend/browsing-load-test.py`)
  measures today's direct calls. Once the endpoints exist, it gets a second
  page model that calls `/api/public/...`, so the two can be compared at the
  same number of visitors.

## Order

1. Snapshot RPCs and migrations for the standings, the overall board and the
   player pool. These are forward-only, and staging gets them first.
2. The `/api/public/*` handlers, with contract and header tests.
3. Switch the web app's public readers one area at a time: football live and
   match first (the biggest poller), then news, then Fantasy public data.
4. Browsing workload before and after, on staging, as an approved run.

None of this is a new paid service. Whether Lovable's hosting caches Worker
responses at its edge is the one open question. If it does not, the
alternative is a Cloudflare cache rule on `botolago.com/api/public/*`, which
is a production change to propose separately.
