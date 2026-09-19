# BG-0012 full-product redesign — Agent A report (shared shell + Accueil)

Branch: `agent/BG-0012-redesign-shell-accueil`, based on `agent/news-cms-launch`
@ `668ea3d5f9bc55a2d9e0968cd4bd3d2e35113c12` (the route-ownership map commit).

## Scope actually touched

- `src/routes/index.tsx` — Accueil, fully restructured.
- `src/components/common/Skeletons.tsx` — added `StandingsRowSkeleton` (additive export only).
- `src/i18n/dictionaries.ts` — added 3 new keys, removed 11 keys that became fully unused by
  the redesign (see "Copy changes" below).
- `src/i18n/i18n-allowlist.ts` — removed the two allow-list entries for a deleted key
  (`news.language.ar`); the file's own type constraint (`satisfies Partial<Record<TranslationKey, …>>`)
  would otherwise fail `bun run typecheck`.
- `scripts/qa/i18n-gate.ts` — updated `BASELINES.W1` (5→4) and `BASELINES.W4` (96→95) to match
  the dictionary's new, smaller warning counts (both went *down*, which the gate's own docstring
  says must be ratcheted in the same commit).
- `src/routes/index.home-structure.test.ts` — new structural test (see "Tests").

Not touched: `src/routes/__root.tsx`, `src/components/shell/*`. I read all of them; they already
match the Fantasy design system (semantic `--brand-*`/`surface-*`/`shadow-*` tokens, no Premier
League branding) and needed no changes for this pass. `AppShell`/`TopBar`/`BottomNav` were left
exactly as-is.

Also left as-is because they were already on-brand and their prop contracts are consumed by
D1/D2/News: `ArticleCard`, `MatchCard`, `PlayerRow`, `ClubCrest`, `Section`, `SectionHeader`,
`States`, `FailureAwareImage`, `Trans`, `FantasySummaryCard`, `FantasyAlertList`. See "Why the
shared primitives weren't restyled" below.

## What changed in Accueil

The previous `index.tsx` had good underlying data wiring but a section order and content mix
that didn't match the approved dashboard structure and, in a few places, duplicated the News
page (a language-selector control, a full lead-story card plus a separate "followed clubs" list,
a trending-players leaderboard, and a private-leagues list — six content sections in total,
in the wrong order relative to the spec). It was rebuilt into exactly the six sections the
ownership map fixes, in order:

1. **Compact greeting** — eyebrow (time-of-day greeting) + manager name + gameweek/date line.
   Kept from the previous version (it was already compact, not a hero), just tightened the
   heading size slightly (`text-[28px]` → `text-[22px]`) so it reads as a header, not a hero.
2. **Matches** — unchanged behavior/markup (`MatchCard` grid off `footballService.getHomeMatches`),
   just reordered to be the first `Section`.
3. **Fantasy** — the previous "hero" block (deadline countdown + team summary/CTA via
   `FantasySummaryCard`, which already renders the gameweek number and `DeadlineCountdown`) is now
   its own `Section` with a header and a "view all → /fantasy" action. Fantasy alerts (deadline/
   price-change/injury nudges) are folded into the same section as a secondary block rather than
   a separate top-level section, since they're contextually part of "your Fantasy status," not a
   distinct dashboard concern.
4. **News preview** — one consolidated section (was two: "lead story" + "followed clubs", plus a
   language `<select>`). Shows up to 3 curated cards (`newsQ.data.lead` plus the next articles,
   deduped) using `ArticleCard`'s existing `compact` variant, with a single "view all → /news"
   action. Dropped the inline language selector — that control existed only on Home (grep
   confirmed `/news` itself has no such control), so it wasn't "the News page's control that Home
   was missing," it was scope creep on the dashboard; language selection belongs on `/news` if
   the product wants it there, not on a preview card.
5. **Standings snapshot** — new. Rendered only when a real, non-empty table is available; see
   "Standings data source" below for how it gets one without touching `src/services/football.ts`
   or `matches.index.tsx` (both outside my ownership / D1's file). Shows the top 5 rows (position,
   crest, short name, played, goal difference, points) reusing the exact i18n keys D1's
   `matches.index.tsx` already uses for its own table (`matches.table_preview`,
   `matches.table.played`, `matches.table.goal_difference`, `matches.table.points`, etc.), so the
   two surfaces read consistently. Loading → 5 `StandingsRowSkeleton` rows; error → `ErrorState`
   with retry; genuinely empty (no season/table yet) → the whole section renders nothing, not an
   empty card shell.
6. **Discovery links** — new. A 2×2 grid of link tiles to `/matches`, `/fantasy`, `/news`,
   `/profile`, replacing the old trending-players and private-leagues sections. Those two features
   still exist and are one tap away via Fantasy's own screens; they just don't belong duplicated
   on Accueil per the "not a duplicate of any product page" requirement, and the ownership map's
   approved structure names exactly these six sections.

### Standings data source

`footballService.getHomeMatches()` always returns `standings: []` (hardcoded). The real standings
path is `footballService.getMatchDay(date, lang, seasonId)`, which D1's `matches.index.tsx`
already uses (season resolved via `getSeasons()` → `isCurrent`). I copied that exact pattern
(`seasonsQ` → `currentSeasonId` → `standingsQ = getMatchDay(new Date(), lang, currentSeasonId)`)
rather than editing `src/services/football.ts` to add a dedicated "current standings" method,
specifically to avoid touching a shared service file mid-flight while D1 is working in it in a
parallel worktree. This does mean the standings query also fetches "today's matches" as a
byproduct, which Home doesn't use (only `.standings` is read) — a small, acceptable inefficiency
in exchange for zero coordination risk. If a dedicated `footballService.getStandings(seasonId, lang)`
export is added later (e.g. by D1, or in a follow-up), Home should switch to it.

### Copy changes (`src/i18n/dictionaries.ts`)

Added (fr/ar, both with matching `{accent}` placeholders): `home.fantasy_hub`, `home.news_preview`,
`home.explore`. Removed (both languages, fully unused after the redesign, confirmed by grep before
deleting): `home.lead_story`, `home.followed_news`, `home.trending`, `home.private_leagues`,
`news.language.label`, `news.language.auto`, `news.language.fr`, `news.language.ar`,
`news.language.original_ar`, `news.language.original_fr`, `news.language.empty`. All of these were
used only in `index.tsx` (grep-verified against the whole `src/` tree before removal).

Removing `news.language.ar` (whose fr/ar values were both the literal string "العربية") dropped
the i18n gate's W1 ("identical fr/ar value") warning count by one and, along with dropping the
dynamic `t(cond ? "…original_ar" : "…original_fr")` call site, dropped its W4 ("non-literal `t()`
key") count by one too. Per `scripts/qa/i18n-gate.ts`'s own documented policy ("a count that goes
*down* means the committed baseline is stale and must be lowered in the same commit"), I lowered
`BASELINES.W1` 5→4 and `BASELINES.W4` 96→95 in that file, and removed the now-stale
`news.language.ar` entries from `src/i18n/i18n-allowlist.ts` (leaving them in place would have
failed `bun run typecheck` there, by that file's own design — see its top comment).

## Why the shared primitives weren't restyled

I read every primitive listed in my scope (`ArticleCard`, `MatchCard`, `PlayerRow`, `ClubCrest`,
`Section`, `SectionHeader`, `States`, `Skeletons`, `FailureAwareImage`, `Trans`,
`FantasySummaryCard`, `FantasyAlertList`) before writing anything. All of them already use the
`--brand-*`/`--surface-*`/`--shadow-*`/`--radius-*` semantic tokens from `src/styles.css`'s
"Design System V2" — the same token layer the `--fpl-*` names alias into (e.g.
`--fpl-ink: var(--brand-primary)`). The task brief's premise that Accueil is "genuinely unstyled"
is accurate for the *page* (a `grep -c -- "--fpl-" src/routes/index.tsx` on the pre-redesign file
does return `0`), but that's because `index.tsx` itself was mixing well-styled primitives into a
mis-ordered, duplicative layout — not because the primitives needed restyling. Changing already
on-brand, already-consumed-by-three-other-agents components' visuals with no visual defect to fix
would have been pure conflict risk for no product benefit, so I limited primitive changes to one
strictly additive export (`StandingsRowSkeleton`) needed for the new section's loading state.

## Validation

- `bun run typecheck` — passes, no errors.
- `bun test` — 838 pass, 0 fail (was 834 pass before my changes; +4 new tests, no regressions).
  Includes the pre-existing `src/i18n/i18n-gate.test.ts` and `src/i18n/launch-copy.test.ts` suites,
  both of which exercise the dictionary changes above.
- `bun run lint` — 0 errors. 13 pre-existing `react-refresh/only-export-components` warnings
  remain, all in files I did not touch (`AuthProvider.tsx`, `MatchTabs.tsx`, `FeaturedGrid.tsx`,
  `PageBackground.tsx`, several `components/ui/*`, `i18n/provider.tsx`,
  `fantasy-owned-provider.tsx`); confirmed via `git diff --stat` that none of those files are part
  of this change.
- `bun run build` — succeeds (`.output/` produced, no build errors).

## Tests added

`src/routes/index.home-structure.test.ts` — a source-shape test (same style as the existing
`ArticleCard.semantics.test.ts` / `launch-copy.test.ts`) since fully rendering `HomeContent` would
require mocking `@tanstack/react-query`, the router, `AuthProvider`, and `I18nProvider` for
marginal benefit. It asserts:
- the six sections' marker strings appear in the required order (greeting → matches → fantasy →
  news → standings → discovery);
- the standings section is gated on `standingsRows.length > 0` / `showStandings &&` (never renders
  an empty fabricated table);
- the news preview links to `/news` and no `news.language`/`newsLanguage` control survived the
  redesign;
- discovery links target `/matches`, `/fantasy`, `/news`, `/profile`.

## Left out of scope (deliberately)

- No changes to `__root.tsx` or `components/shell/*` — already correct for this pass.
- No changes to `ArticleCard`/`MatchCard`/`PlayerRow`/`ClubCrest`/etc. visuals — already on-brand;
  see above.
- No new `footballService` method for standings — reused D1's existing `getMatchDay` pattern
  instead of touching a shared service file mid-parallel-work (see "Standings data source").
- Trending players and private leagues are no longer inline on Accueil; both remain reachable via
  `/fantasy` (unchanged, out of my scope) and via the new discovery link.
- Did not add a dedicated `/standings` or `/matches` deep-link parameter for "jump to table" — the
  existing `/matches` route already has its own standings table (per D1's ownership); "view all"
  from Home's snapshot just points at `/matches` as the ownership map's "not yet assigned" note
  says to do until D1 confirms a more specific target.
