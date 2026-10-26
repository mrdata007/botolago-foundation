# Front-end performance, 2026-10-26: speed of the first screen

Package E of the quick audit remediation. Follows
[PERFORMANCE_2026_09_24.md](PERFORMANCE_2026_09_24.md) and
[NAVIGATION_SPEED.md](NAVIGATION_SPEED.md).

## How it was measured

`bun run build` (production mode), then `bun run perf:budget`
(`scripts/qa/perf/bundle-budget.ts`). The script reads the client manifest the
server embeds (`.output/server/_tanstack-start-manifest_v-*.mjs`): the root
route's entry script and `modulepreload` list plus the route's own preloads,
which is what the HTML of `/` tells the browser to fetch. Sizes are the files
in `.output/public/assets`, gzip level 6 (Node's default; a CDN's Brotli is
smaller). `--list` prints the 40 heaviest files, `--json` the numbers.

This is a build measurement, not a browser one: no Lighthouse or throttled run
was made for this package, so no timing claim is made here.

## Before and after, route `/`

| First view of `/`                       | before          | after           |
| --------------------------------------- | --------------- | --------------- |
| script files                            | 94              | 95              |
| JavaScript, raw                         | 1573.4 KB       | 1571.7 KB       |
| JavaScript, gzip                        | 490.9 KB        | 490.5 KB        |
| main entry (`index-*.js`), raw          | 496.8 KB        | 319.7 KB        |
| main entry, gzip                        | 158.0 KB        | 102.7 KB        |
| stylesheet (`styles-*.css`), raw / gzip | 213.7 / 35.5 KB | 213.7 / 35.5 KB |

The first-view bytes did not move. What changed is where they sit: React DOM
and the Supabase client are two vendor files (`vendor-react`, `vendor-supabase`)
that no longer change with every deploy, so a returning visitor re-downloads
the 100 KB gzip that is the application's own entry instead of 158 KB that
included them. The one extra file is that split.

## What was changed

- **Vendor split** (`vite.config.ts`, client build only): `vendor-react` and
  `vendor-supabase` code-splitting groups. It had to be scoped to the client
  environment: set at the top level, Rolldown also applied it to the server
  build and warned that it overrides `inlineDynamicImports`.
- **Native push code only in the app**
  (`src/components/native/NativePushBridgeGate.tsx`, mounted by the root): the
  bridge already did nothing outside the phone app, but its code was in every
  visitor's root graph. About 3 KB raw, 1 KB gzip.
- **match_votes read once** (`src/components/predictions/use-match-votes.ts`):
  the read waits until the session is known. Before, a signed-in player's
  read went out under the visitor key while the session loaded and again under
  their own key a moment later. One read per match card remains, as designed
  (the card in view and its neighbours, the rest when idle).
- **fantasy_prizes only near the prize section**
  (`src/components/landing/LandingPage.tsx`, the prizes query only, and
  `src/lib/use-near-viewport.ts`): the catalog is read when the "why come
  back" section is within 600 px of the viewport. It fails open (no
  IntersectionObserver, no element: read at once).
- **Section warm-up** (`src/lib/section-warmup.ts`): it already waited for
  `load`, 2 s of settled page, browser idle time and an idle router, and
  skipped `saveData`. It now also skips `effectiveType` `slow-2g` and `2g`.
- **Images**: `width`/`height` added to the Stadium band photo (1600x600) and
  the create-team art in `FantasySummaryCard` (640x467, which was `w-auto`
  with a lazy load and so had no width until it arrived). `FailureAwareImage`
  and `MediaImage` fill a box whose shape the caller sets (`absolute inset-0
h-full w-full`), so intrinsic attributes would change nothing; left alone.
- **Budget**: `bun run perf:budget` fails above 540 KB gzip / 105 files /
  39 KB gzip of CSS for `/` (about 10% over the figures above). Manual check,
  not wired into the Lovable build.

## Findings that were checked and left alone

- **Route splitting is already on.** The built routes are `?tsr-split=component`
  chunks, so Fantasy, Curva, Plus and admin screens are not in the `/` graph
  (the heaviest admin file, `PlayerMappingsScreen`, is server-only for `/`).
  No Fantasy-screen, Curva, Plus or chart (`recharts`) code is among the 95
  files; `motion` is 3.5 KB gzip.
- **Unused CSS.** Every `@keyframes` in `src/styles.css` is used. 49 plain
  class selectors exist; the unreferenced ones are `lucide-*` selectors that
  target the icon library's generated class names, `.glass-soft`,
  `.glass-regular`, `.surface-3` and `.mesh-drift` (the last two are
  `@utility` rules Tailwind drops when unused, and `public/demo/app.html`
  references them). Together under 0.5 KB, with dynamic-class-name risk, so
  nothing was removed. The 214 KB is mostly Tailwind output and the design
  tokens, not dead rules. Critical-CSS inlining is not offered by the build
  tool; not attempted.
- **A 214 KB stylesheet still blocks the first paint** (35.5 KB gzip).
  Splitting the route-specific rules (Plus, Curva, Fantasy cards) out of it
  would be the next CSS step.

## Remaining client calls on home (read from the code, not captured in a browser)

| call                                               | needed on first screen                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| `football` home matches, clubs, seasons, standings | yes, the loader prefetches them (French keys; Arabic refetches)          |
| news edition                                       | yes (articles on home)                                                   |
| fantasy summary, current gameweek, availability    | yes for the Fantasy card and the band's deadline                         |
| `alerts`, `all-players-for-alerts`                 | only for a signed-in manager with a team; check it is not run for guests |
| season result days                                 | for the date strip                                                       |
| `home-stories`                                     | yes if the stories band is shown                                         |
| `match_votes` per card                             | yes for the card in view and neighbours; the others at idle              |
| predictions "mine"                                 | only signed in                                                           |
| manager card status                                | root, once                                                               |
| `fantasy_prizes`                                   | no longer: near the prize section only                                   |

## What is left, largest first (outside this package's files)

1. **French dictionary: 198 KB raw in the shared graph** (`dictionary-fr`,
   inside `provider-*.js`, 67 KB gzip together with the i18n provider). The
   Arabic one is already lazy; the French one could be split by screen.
2. **Fantasy code in the root graph**: `FantasyOwnedProvider` in
   `src/routes/__root.tsx` imports the owned repository, the mock Fantasy data
   (`src/mocks/fantasy-data.ts`), transfers and the engine, so `fantasy-hub-share`
   (10 KB gzip), `fantasy-runtime` (6 KB) and `schemas` (zod, 19 KB) load for
   every page. Loading the provider's repository on demand is the biggest win
   available, and touches business-critical files.
3. **Sample data in production**: `src/backend/predictions`, `news` and
   `football` mock repositories and `src/mocks/*` ship in the shared graph
   (about 70 KB raw) although production never selects them.
4. **supabase-js** brings realtime and storage clients (about 55 + 21 KB raw)
   that public pages never use.
5. **`sonner`** (9 KB gzip) is imported by many components, so the Toaster
   cannot be deferred alone.
6. The 94 to 95 modulepreload links include about 30 icon files of under 1 KB;
   merging them was not tried (a Rolldown group would put every icon any
   screen uses in one file the home page then downloads).
