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

## Second pass: less code on the first view

Measured the same way on the same day, after package E's first commit. The
first pass moved bytes between files; this one removes them from the first
view.

| First view of `/`                       | before this pass | after           |
| --------------------------------------- | ---------------- | --------------- |
| script files                            | 96               | 98              |
| JavaScript, raw                         | 1568.5 KB        | 1346.5 KB       |
| JavaScript, gzip                        | 489.7 KB         | 430.1 KB        |
| main entry (`index-*.js`), raw          | 315.9 KB         | 304.0 KB        |
| main entry, gzip                        | 101.5 KB         | 98.2 KB         |
| stylesheet (`styles-*.css`), raw / gzip | 212.4 / 35.4 KB  | 212.4 / 35.4 KB |

By change (gzip, cumulative): sample-data repositories 489.7 to 486.2 KB;
owned Fantasy repository and Fantasy sample data to 475.7 KB; French
dictionary to 430.1 KB. The two extra files are the lazy halves of what was
split (`dictionary-fr-rest`, the Fantasy repositories chunk); the sample-data
chunks are fetched only in development.

- **French dictionary in two parts**
  (`src/i18n/dictionary-fr-core.ts`, `dictionary-fr-rest.ts`,
  `dictionary-fr-loader.ts`; `dictionary-fr.ts` is now the two together, for the
  server, the tests and the i18n gate). The core part is 576 of the 3289 keys:
  every key the code of the home page can ask for (the import closure of the
  root and home routes), plus what the other routes' `head()` and the Fantasy
  page heads read. `scripts/qa/i18n-split.ts` decides it and
  `src/i18n/dictionary-split.test.ts` fails when a key the home page needs sits
  in the rest part; `bun scripts/qa/i18n-split.ts --write` moves keys. The rest
  (166 KB raw, about three quarters of the dictionary) is fetched by `loadFrenchRest()`:
  - the server and the tests have the whole dictionary from the start, so the
    HTML is the same as before;
  - in the browser the router waits for it before hydrating any page other than
    `/` (`router.tsx`, `hydrate`) and before rendering a client navigation to
    one (root `beforeLoad`), so no page renders raw keys or hydrates with
    different text;
  - the warm-up fetches it two seconds after the home page has settled
    (`SectionWarmup`), so a tap normally waits for nothing; with `saveData` or a
    2G connection it is fetched at the tap;
  - a key asked for before the rest has arrived (not expected) renders its key,
    starts the fetch and re-renders when it lands.
    Route files that read `fr[...]` in `head()` now import `frCore` (typed: a key
    outside the core part is a compile error there).
- **Owned Fantasy repository on demand**
  (`fantasy-owned-repository-lazy.ts`, `fantasy-guest-repository.ts`): the root
  provider builds the guest repository at once (it reads nothing) and fetches
  the local and cloud repositories, the transfer rules and the Fantasy sample
  data on the first call. `fantasy-mock-lazy.ts` and `fantasy-team-patch.ts` do
  the same for the sample Fantasy service (the one synchronous method,
  `saveTeam`, moved to the light file). Rules, scoring and the lifecycle are
  untouched.
- **Sample-data repositories on demand** (`src/backend/lazy-repository.ts`):
  Football, News, Predictions, Pépites and Prizes build their mock repository
  on first use. Production never selects them (`select*DataMode`), so the
  sample data (`src/mocks/*`, 70 KB raw) is out of the first view.

Checked and left: supabase-js brings the realtime (about 40 KB raw) and storage
(21 KB) clients through `createClient`. A lighter client would mean assembling
auth, PostgREST and functions by hand around `src/integrations/supabase/client.ts`,
which is a managed file; not done. `auth-mock` (6.5 KB raw) stays because
`authService` is synchronous.

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
- **Budget**: `bun run perf:budget` first failed above 540 KB gzip / 105 files /
  39 KB gzip of CSS for `/`; after the second pass (above) it fails above
  475 KB gzip / 108 files / 39 KB CSS, about 10% over the new figures. Manual
  check, not wired into the Lovable build.

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

1. **supabase-js realtime and storage clients** (see above).
2. **`schemas` (zod, 19 KB gzip)** is used by the football, news, auth and
   Fantasy contracts the home page reads; it stays until those parse with
   something lighter.
3. **`sonner`** (9 KB gzip) is imported by many components, so the Toaster
   cannot be deferred alone.
4. The modulepreload links include about 30 icon files of under 1 KB; merging
   them was not tried (a Rolldown group would put every icon any screen uses in
   one file the home page then downloads).
5. **A 214 KB stylesheet still blocks the first paint** (35.5 KB gzip).
