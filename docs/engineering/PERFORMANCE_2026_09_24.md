# Front-end performance, 2026-09-24: before and after

Audit 2026-09-24, P1-11 (and F-02, F-03, F-05 of its performance stream).
"Before" is `d257de7` (main when the audit ran); "after" is this branch.

## How it was measured

Both versions were built the way production builds them (`vite build`,
production mode, Supabase data), as Node servers on this machine, both reading
the same local database (`supabase start`, the Gameweek 1 mirror of
`scripts/backend/rehearsals/`). Production was not load-tested. Each run
alternated the two versions, so a change in the machine's load hit both.

Two things make the absolute numbers worse than production's and do not
affect the comparison: the local server does not compress (the browser
downloads ~1.2 MB of JavaScript instead of ~340 KB gzip), and the database
holds one season of sample data.

- **First visit** (Lighthouse 12, performance only, 3 runs, median; mobile =
  Lighthouse's simulated slow 4G and 4x CPU at 360/390/430 px; desktop =
  its desktop preset). Every Lighthouse run is a first visit: splash,
  language chooser and welcome screen.
- **Returning visitor** (language chosen, welcome done; Chromium through
  CDP with real throttling: 4x CPU, 150 ms, 1.6 Mbps down; 3 to 7 runs,
  median): `node scripts/qa/perf/returning-visit.mjs before=<url> after=<url>`.
  Metrics come from the browser's own `largest-contentful-paint`,
  `layout-shift` and `longtask` entries; TBT here is the sum of long-task
  time over 50 ms after first paint.

INP needs a real visitor's taps; TBT is its lab stand-in.

## JavaScript every page downloads (production build, gzip)

|                      | before                          | after                 |
| -------------------- | ------------------------------- | --------------------- |
| shared by every page | 361 KB (1,223 KB raw, 23 files) | 340 KB (1,135 KB raw) |
| article page         | 365 KB                          | 344 KB                |

What moved: the Arabic dictionary (~75 KB of text) now downloads only for
readers who choose Arabic (`perf(web): load the Arabic dictionary only for
Arabic readers`).

## Returning visitor

| page, width              | LCP before → after | CLS before → after | TBT before → after | first paint |
| ------------------------ | ------------------ | ------------------ | ------------------ | ----------- |
| `/` 360                  | 4.90 → 4.96 s      | **0.185 → 0.002**  | 580 → 532 ms       | +70 ms      |
| `/` 390                  | 4.91 → 4.96 s      | **0.207 → 0.002**  | 540 → 598 ms       | +50 ms      |
| `/` 430                  | 4.90 → 4.99 s      | **0.294 → 0.003**  | 536 → 555 ms       | +80 ms      |
| `/` desktop              | 1.22 → 1.26 s      | **0.081 → 0.001**  | 43 → 41 ms         | +16 ms      |
| `/matches` 390           | **6.04 → 4.51 s**  | 0.001 → 0.001      | 571 → 554 ms       | +130 ms     |
| `/matches/standings` 390 | **9.15 → 4.48 s**  | 0 → 0              | 491 → 508 ms       | +140 ms     |
| `/clubs` 390             | 4.32 → 4.49 s      | 0.032 → 0          | 448 → 531 ms       | +170 ms     |

- **Layout shift on the home page is gone** at every width: 0.19-0.29
  ("poor" above 0.25) to 0.003. The server now sends the home page with its
  matches and standings, so nothing jumps in after the page appears.
- **Standings: the table is in the HTML**, so the largest thing on the page
  paints with the first paint: 9.2 s to 4.5 s.
- **Matches: 6.0 s to 4.5 s.** Its header photo is the largest element and
  was downloaded behind ~40 scripts; it now carries `fetchpriority="high"`,
  like the other page headers. (Without it, this branch measured 6.5 s:
  the dictionary split had moved it further back in the queue.)
- First paint is 50-170 ms later everywhere: the HTML is bigger because it
  now carries the content (home 45 → 62 KB, clubs 22 → 58 KB, uncompressed).
  With production's gzip that is 3-6 KB more, about 20-30 ms on the same
  connection. It is the price of pages that show and index their content.
- TBT is unchanged within the run-to-run spread (about ±60 ms).

## First visit (Lighthouse)

| page, width              | score   | FCP           | LCP             | TBT          | CLS           | JS (uncompressed) |
| ------------------------ | ------- | ------------- | --------------- | ------------ | ------------- | ----------------- |
| `/` 360                  | 43 → 46 | 9.99 → 9.78 s | 12.02 → 12.02 s | 513 → 413 ms | 0 → 0         | 1,268 → 1,198 KB  |
| `/` 390                  | 45 → 44 | 9.98 → 9.77 s | 11.88 → 12.02 s | 426 → 472 ms | 0 → 0         | 1,268 → 1,198 KB  |
| `/` 430                  | 45 → 45 | 9.98 → 9.78 s | 12.02 → 12.01 s | 448 → 438 ms | 0 → 0         | 1,268 → 1,198 KB  |
| `/` desktop              | 78 → 79 | 1.88 → 1.87 s | 2.30 → 2.24 s   | 13 → 17 ms   | 0.001 → 0.003 | 1,268 → 1,198 KB  |
| `/matches` 390           | 52 → 54 | 9.67 → 9.52 s | 9.84 → 9.82 s   | 226 → 171 ms | 0.001 → 0.001 | 1,262 → 1,206 KB  |
| `/matches/standings` 390 | 49 → 52 | 9.53 → 9.39 s | 10.77 → 10.25 s | 316 → 234 ms | 0 → 0         | 1,259 → 1,204 KB  |
| `/clubs` 390             | 51 → 50 | 8.91 → 9.05 s | 9.99 → 9.29 s   | 259 → 302 ms | 0.032 → 0     | 1,215 → 1,163 KB  |

(The first-visit rows were measured before the `/matches` header fix.)

On a first visit the largest paint is the onboarding itself (splash, then the
language chooser and the welcome photo, drawn after the scripts run), so it
barely moves: ~12 s simulated here, 10.2 s in the audit's production run.
That is the audit's F-02, a product decision about the first-visit flow, not
something a bundle change fixes.

## What is left, largest first

1. **First-visit onboarding** (F-02): let the page paint first and show the
   language choice as a banner, or preload the welcome photo. Needs a design
   decision.
2. **Shared JavaScript** (F-03), 340 KB gzip on every page: supabase-js
   brings its realtime and storage clients (~20 KB gzip) that public pages
   never use; zod schemas (~18 KB gzip) validate public reads in the
   browser; the sample-data modules (~8 KB gzip) ship although production
   never uses them; `sonner` and `motion` load up front; ~40
   `modulepreload` links fetch everything before the page's own code runs.
3. **Fonts** (F-08): the Google Fonts stylesheet blocks the first paint.
