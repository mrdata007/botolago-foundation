# BG-0152 · Pépites on the main design (screen brief)

Owner decision, 2026-10-05: **Pépites must look like the rest of the app.** It
drops its own look (night bands and the slanted cut, the energy gradient, IBM
Plex Mono meta lines, the `--pepites-*` palette, the Changa slant, ghost
numbers, `TiltFrame`, glass-on-night buttons, the separate night top bar) and is
rebuilt on the main kit: `src/components/ui-kit` (`tokens.ts`, `primitives.tsx`)
and the `--ui-*` tokens in `src/styles.css`.

Branch `claude/pepites-main-design`. This brief is committed before any
interface change, as AGENTS.md "Screen work" rule 3 requires; copy it into the
draft pull request description.

Scope: every public Pépites screen (`/pepites`, `/pepites/classement`,
`/pepites/joueur/$playerId`, `/pepites/semaine/$n`, `/pepites/methode`,
`/pepites/comparer`, `/pepites/revelation`) and the two admin Pépites screens
(`/admin/pepites`, `/admin/pepites/donnees`). The admin screens are in scope
because deleting the Pépites class layer (`pp`) means converting them to the
admin kit classes.

Out of scope, listed as follow-ups:

- The share images (`src/components/pepites/share-image.ts`, the 1080×1350
  Top 10 post and the 1080×1920 story card) and the Fantasy recap image
  (`src/components/fantasy/recap-image.ts`, which imports the share-image
  helpers). Their exports and drawing stay as they are, and so does the IBM
  Plex Mono `@font-face` in `src/fonts.css`, because the canvas loads that
  face. Redraw both pictures together in a later change.
- The Pépites route files (`src/routes/pepites*.tsx`, `admin.pepites*.tsx`),
  which hold no styling.

## What must be preserved

**Data and behaviour.** Every figure, list, filter, sort, tab, link, dialog,
timer and state the screens show today, computed the same way. Nothing in
`pepites-format.ts`, `pepites-route.ts`, `use-pepites.ts`, `reveal.ts`,
`admin/admin-format.ts` or the backend changes. The Pépites score, its
components, the rating bands (`ratingBand`: <6, 6–6.5, 6.5–7, 7–7.5, ≥7.5), the
ten-segment rounding (`segments`), movement, Follow, Compare, the weekly email
switch, Report an issue, the share sheet and the reveal story all behave as
they do now.

**Routes and search params.** Same paths, same `poste=`, `onglet=`, `a=`/`b=`,
`n=` parameters, same redirects.

**States.** Loading (skeletons, then the error state after 12 seconds,
`LOADING_GIVE_UP_MS`), error with retry, coming soon (mode off or staff only),
before the first edition (last season's final ranking under its own label),
preview banner for staff, the reveal countdown and the "delayed" banner, the
"published on" line.

**Test contracts** (`tests/e2e/pepites.e2e.ts`,
`tests/e2e/pepites.local-stack.e2e.ts`). Every `data-testid` the two suites use
stays, on an element that does the same job. In particular:

- `/pepites`: exactly 10 `pepites-top-entry` links (the N°1 in the hero plus
  nine rows), and the hero's text contains the N°1's name;
  `pepites-edition-title` holds the week title; `pepites-home-filter-{FWD,MID,DEF,GK,age,all}`
  are toggles with `aria-pressed`; `pepites-full-ranking`, `pepites-share`,
  `pepites-reveal-play`, `pepites-email-card` with `pepites-email-switch`
  (`aria-checked`), `pepites-reveal-countdown`, `pepites-reveal-delayed`,
  `pepites-coming-soon`.
- `/pepites/classement`: `pepites-ranking-row` is on the phone rows only (20,
  then 30 after `pepites-load-more`, at 390px), and the first row contains the
  screen-reader position label; `pepites-filter-MID` (and the other
  `pepites-filter-*`), `pepites-ranking-followed` with `aria-pressed`,
  `pepites-ranking-back` (used with `.first()` and `.last()`); exactly **one
  visible `<h1>` per breakpoint**, wider than 250px at 768px; the links in
  `pepites-desktop-podium` stay inside a 768px viewport;
  `pepites-desktop-table`, `pepites-desktop-filters`.
- `/pepites/joueur/…`: `pepites-player-name`, `pepites-player-components`,
  `pepites-breakthrough`, `pepites-player-stats`, `pepites-player-share`,
  `pepites-player-compare`, `pepites-fantasy-link`, `pepites-follow` (with
  `aria-pressed`), `pepites-follow-retry`, `pepites-report*`; tabs found by
  role with ids `pepites-player-tab-{overview,matches,stats}` (from
  `UiTabs idBase="pepites-player"`) and the panel's `aria-labelledby`;
  `pepites-player-matches` keeps `<li>` children; `pepites-back` sits inside
  `pepites-desktop-player-hero`; `pepites-desktop-player-body`,
  `pepites-desktop-rating-trend`, `pepites-desktop-face-to-face`.
- `/pepites/comparer`: `pepites-compare-pick-a`/`-b`, `pepites-compare-option`
  (25 per page), `pepites-compare-card`, `pepites-compare-empty`, the picker's
  search field found with `getByRole("searchbox")`, and focus returning to the
  picker when the dialog closes. `tests/e2e/pepites.e2e.ts:339` also expects
  `pepites-compare-cards`, which no source defines today: add that test id to
  the container of the compare cards instead of weakening the test.
- `/pepites/revelation`: `pepites-reveal-name`, `pepites-reveal-next`,
  `pepites-reveal-done`, the `n=` step in the address.
- Share images: 1080×1350 and 1080×1920, download named
  `pepites-semaine-15.png` (unchanged because `share-image.ts` is untouched).
- Admin: every `admin-pepites-*` id.

**Copy.** The same French and Arabic strings, from the dictionaries. Prefer
existing keys. Literals that are not in the dictionaries today ("DATA", "VS",
"U23") are removed or moved into the dictionaries in French **and** Arabic. A
key that is no longer used is deleted from both languages, and the W3 baseline
in `scripts/qa/i18n-gate.ts` moves to the measured value with a dated note.

**Accessibility.** Every image keeps an `alt`, every icon-only control a
translated `aria-label`, every toggle its `aria-pressed`, the switch its
`aria-checked`, the timer its `role="timer"`, the tabs their roving tabindex
and the dialogs their focus return. The 44px tap floor holds on every control.

**Arabic.** Logical properties only; `tracking-*` only behind `ltr:`; Latin
digits in both languages and no space inside a number (`formatNumber`,
`formatCount`); a score is three flex children, never one string in a `<bdi>`;
the Arabic leading of the kit's display and text steps is not overridden.

**Brand.** BotolaGO's identity is the main app's: Floodlight Navy, white cards
on the light page, Changa for titles and standalone figures, Manrope and Noto
Sans Arabic for the rest, the spring-to-sky action gradient for the primary
call to action. The logo is not touched.

## Improvements being made

1. **One look.** Pépites renders inside the default `AppShell` with the global
   `TopBar` and `BottomNav` at every width, on the neutral page. `PepitesTopBar`
   is deleted and the `tone="night"` branch of `PrimaryNavLinks` goes with it.
   The global bar already shows the profile button when `PEPITES_PROMOTED` is
   on.
2. **Kit components replace the Pépites parts** (mapping table below): hub
   screens open on `UiPageTitle`, detail screens on `UiHeader` with a back
   pill; cards are `UiCard`; filters are `UiChip`; tabs are `UiTabs`; tables
   are the `UiTable` family; states are `UiStatePanel`/`UiEmptyState`/
   `UiErrorState`/`UiSkeleton`; banners are `UiAlert`; figures are
   `UiStatBlock`; movement is `UiRankMovement`; crests and photos are
   `ClubCrest` and `PlayerPhoto`; club colour arrives through `clubStyle()`
   and the `ui.edge.*`/`ui.club.*` classes.
3. **Type and colour from the kit only.** No literal colour (hex, `rgb()`,
   `bg-white`, `text-white`, `/opacity` whites), no literal px font size, no
   `clamp()` size, no off-scale radius, no `leading-none` on text. Display
   text uses `ui.display.*`, standalone figures `ui.score.*`, figures read
   down a column `ui.stat.*`, prose and labels `ui.text.*`.
4. **Rating colours keep a five-step data scale** through new derived kit
   tokens: `--ui-rating-N: var(--ui-fdr-(6−N))` and
   `--ui-on-rating-N: var(--ui-on-fdr-(6−N))`, rating 5 (best) on FDR 1
   (green), rating 1 on FDR 5 (deep magenta). They are registered in
   `tokens.ts` next to the FDR tokens, so they get the dark values and the
   measured on-colours of the FDR scale. White text on the old rating colours
   failed 4.5:1 on all five bands.
5. **Data glyphs on the kit.** `Seg10Bar`: ten rounded segments, lit
   `--ui-ink-fg`, unlit `--ui-surface-sunken`, no skew. `ScoreRing`: sunken
   track, `--ui-ink-fg` arc, the figure in `ui.score.*` and its label in
   `ui.text.label`. Compare bars: the winner's bar `--ui-ink-fg`, the other
   sunken, the winner's figure `ui.tone.positive`. `FillBar`: sunken track.
   The rating trend is **one** component for phone and desktop: oldest point
   at the inline start (so it mirrors in Arabic), direction computed in code
   (no CSS flip), grid `--ui-rule`, labels `ui.text.micro` muted, line
   `--ui-ink-fg`, dots in the rating tokens, the average dashed in
   `--ui-on-surface-faint`.
6. **Photos.** `Headshot` becomes `PlayerPhoto` (club silhouette through
   `teamAsClub`). The orange "photo missing" dot leaves the public screens;
   photo status stays visible in admin.
7. **Direction.** Back links are `UiBackButton` (or `UiHeader backTo`). No
   manual `rtl:-scale-x-100` or `rtl:rotate-180` on lucide icons: a global
   rule in `styles.css` already mirrors arrows and chevrons, and the manual
   flip composed with it and pointed four icons backwards in Arabic. The
   literal "→" glyphs become lucide `ArrowRight`/`ChevronRight`.
8. **Tap floor and headings.** Every control reaches 44px (`ui.space.tap`,
   `UiButton size="sm"`, `UiChip`); `leading-none` and `truncate` no longer
   clip Changa or Arabic glyphs.
9. **Reveal** (`/pepites/revelation`) becomes a light kit page: same story
   order, same card-flip moment, same behaviour, visuals from kit tokens, and
   a bottom safe-area inset (`pb-[max(env(safe-area-inset-bottom),1.5rem)]`
   or equivalent).
10. **Admin.** `/admin/pepites` and `/admin/pepites/donnees` use the admin kit
    classes (`ADMIN_LABEL_CLASS`, `AdminSectionHeading`, `ADMIN_PANEL_CLASS`,
    `ADMIN_CARD_CLASS`, `AdminBadge`) and `ui.*`; the status pill is `UiBadge`
    through `statusTone()`; the schedule button `UiButton variant="gradient"`;
    the reason field `UiTextarea`.
11. **Dark mode.** Dark mode is being switched on in another lane. Every
    Pépites screen is correct under `.dark` because every colour comes from a
    `--ui-*` token.
12. **Dead layer removed** once no screen reads it (integration stage):
    `pp`, `SEGMENT_COLOURS`, `GoMark`, `NightBand`, `EnergyStreak`,
    `MonoLine`, `FilterChip`, `FactsStrip`, `ShortBand`, `TiltFrame`, the
    `--pepites-*` tokens, `.pepites-night-band`, and the `card-flip` utility
    if the reveal no longer needs it; DESIGN.md, `.impeccable/design.json`
    and the Pépites docs are updated to say Pépites uses the kit.

## Acceptance criteria (visual and functional)

Visual:

- A Pépites screen is indistinguishable in style from Matches, Fantasy and
  News: the same shell (global top bar, bottom bar, light page), the same
  white 14px cards (16px for a feature card), the same type ramps, the same
  navy, chips, tabs, tables, badges, buttons and states.
- No night band, slanted cut, energy gradient, Plex mono line, Changa slant,
  ghost number, tilt or glass-on-night control remains on any in-scope screen.
- Club colour appears only as `clubStyle()` edges, discs, fills and the
  shirt, never as an inline hex.
- Correct in light and in `.dark`, in French and in Arabic (RTL), at 390px and
  at 1440px; before/after screenshots for each.
- Contrast measured from rasterised sRGB pixels, never by parsing `oklch`.

Functional:

- Every contract listed under "What must be preserved" holds; the Pépites
  e2e suite passes against this branch's own dev server.
- Every control measures at least 44×44px.
- No horizontal page overflow at 390px in either language, measured with
  element boxes (not `scrollWidth === clientWidth`, which `overflow-x: clip`
  hides).
- Source rules, checked by grep over `src/components/pepites/**`: no
  `pp.`/`--pepites-`, no `text-[Npx]`, no hex or `rgb(` literal outside
  `share-image.ts`, no `bg-white`/`text-white`, no physical utilities, no
  `tracking-*` without `ltr:`, no `rtl:-scale-x-100`/`rtl:rotate-180`, no
  `leading-none`.
- `bun run typecheck`, `bun run lint` (0 errors), `bun test` (including
  `ui-kit.contract.test.ts`, `a11y-source.test.ts` and `i18n-gate.test.ts`)
  and `bun scripts/qa/i18n-gate.ts` pass.

## Pépites on the kit: what replaces what

The screen agents follow this table. "Shared" means the foundation stage has
already restyled the piece in `PepitesVisuals.tsx`, `PepitesParts.tsx` or
`PepitesShell.tsx`; use it rather than rebuilding it.

### Frame and states

| Pépites piece today                                                | Kit replacement                                                                                                                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PepitesTopBar` (phone night bar, GoMark, avatar)                  | deleted; the global `TopBar` at every width (profile button when `PEPITES_PROMOTED`)                                                                                                |
| `PepitesShell` with `pp.page`, default `NightBand`, `tone="night"` | shared `PepitesShell`: default `AppShell`, neutral page, `pageHeader` slot, `width="content" \| "desktop"`                                                                          |
| `NightBand` hero on a hub (Home, Ranking, Method)                  | `pageHeader={<PepitesPageTitle title=…>chips</PepitesPageTitle>}` (shared wrapper of `UiPageTitle`; `desktop` lines it up with a desktop-width page)                                |
| `NightBand` hero on a detail page (Player, Compare, Edition)       | `pageHeader={<PepitesDetailHeader kicker=… title=… />}` (shared wrapper of `UiHeader` with a `UiBackButton` that carries a test id), or a `PepitesBack` inside the page's hero card |
| text back links ("← Pépites"), `rtl:-scale-x-100` chevrons         | `PepitesBack` / `UiBackButton` / `UiHeader backTo`; no manual flip                                                                                                                  |
| `ShortBand`                                                        | nothing: the shell no longer draws a band                                                                                                                                           |
| `PepitesCard` (`rounded-[14px]`, `pp.card`)                        | shared `PepitesCard` = `UiCard` (prefer `UiCard` directly in new code)                                                                                                              |
| `StateCard`, `PepitesComingSoon`                                   | shared, now `UiEmptyState`                                                                                                                                                          |
| `PepitesLoadingState` (night band, bone rows)                      | shared, now `UiSkeleton` rows in the plain shell; still gives up after 12 s                                                                                                         |
| `PepitesErrorState` (literal retry button)                         | shared, now `UiErrorState` with the ink retry button                                                                                                                                |
| `PepitesBeforeFirstEdition` (short band, slanted h2)               | shared, now `PepitesPageTitle` + `UiCard` + kit rows                                                                                                                                |
| `PepitesPreviewBanner`                                             | shared, now `UiAlert tone="info"`                                                                                                                                                   |
| `PepitesRevealBanner` (night band, energy clock)                   | shared, now `UiAlert tone="info"` (inside a `role="timer"` box for the countdown) with the clock in `ui.score.sm`, tabular                                                          |
| `UpdatedLine`                                                      | shared, now `ui.text.meta` muted                                                                                                                                                    |
| `MonoLine` meta line                                               | `ui.text.meta` + `ui.tone.muted` (a kicker above a title: `ui.text.label` muted)                                                                                                    |
| `CardHeading` (mono)                                               | `SectionHeader` (`subtitle` for the aside; `action` + `SectionHeaderLink` for a link)                                                                                               |
| inline section links with no height                                | `SectionHeaderLink`, or `UiLinkButton size="sm" variant="soft"`                                                                                                                     |
| "load more", plain buttons at 36–42px                              | `UiButton variant="soft"` (`size="sm"` inline)                                                                                                                                      |
| full-ranking pill (`text-white` on ink)                            | `UiLinkButton variant="ink"` with a lucide `ChevronRight` (no manual flip)                                                                                                          |
| empty lists                                                        | `UiEmptyState`                                                                                                                                                                      |

### Data and figures

| Pépites piece today                                             | Kit replacement                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FilterChip` (26px)                                             | `UiChip` (`selected`, spreads `data-testid`, sets `aria-pressed`) in the shared `PepitesChipRow` (the News chip rail: scrolls on a phone, wraps from 768px); a chip that changes the address is a `UiChip` whose `onClick` calls `navigate({ search })`, so it keeps `aria-pressed` |
| `RatingChip` (`--pepites-rating-*`, white text)                 | shared `RatingChip`: `--ui-rating-N` fill with `--ui-on-rating-N` text, `ui.radius.tight`, `ui.text.micro` heavy, tabular                                                                                                                                                           |
| `Seg10Bar` (skewed, ten energy colours)                         | shared `Seg10Bar`: ten rounded segments, lit `--ui-ink-fg`, unlit `--ui-surface-sunken`                                                                                                                                                                                             |
| `ScoreRing` (energy gradient arc, white figure)                 | shared `ScoreRing`: sunken track, `--ui-ink-fg` arc, `ui.score.*` figure, `ui.text.label` muted label                                                                                                                                                                               |
| `FillBar` (`rounded`, caller-picked fill)                       | shared `FillBar`: `ui.radius.track` sunken track, `fill="ink"` or `"faint"`                                                                                                                                                                                                         |
| `Headshot` (radial club disc, initials, orange missing dot)     | shared `PepitesPlayerPhoto player={…} size="xs"…"xl"` (the kit's `PlayerPhoto` with `teamAsClub` and `playerPhotoUrl`); the deprecated `Headshot` alias maps 20/36/44 to xs/sm/md until the screens move                                                                            |
| `PepitesShirt`                                                  | shared `PepitesShirt` (kept: the club kit with the surname and rank; the literal drop shadow is gone)                                                                                                                                                                               |
| `MovementMark` (9px mono, in `TopTenList.tsx`)                  | shared `MovementMark` in `PepitesVisuals.tsx`: `UiRankMovement variant="quiet"`, and `UiBadge tone="positive"` for "new"; delete the local copy                                                                                                                                     |
| `FactsStrip` (four figures between hairlines on night)          | a grid of `UiStatBlock size="sm"` (labels wrap; values in `<bdi>`)                                                                                                                                                                                                                  |
| hero score (78px energy text)                                   | `ui.score.hero` + `ui.tone.ink`                                                                                                                                                                                                                                                     |
| player name (slanted 28px / `clamp(38–66px)`)                   | `ui.display.hero` (phone `ui.display.section` where it must fit one line); no `leading-none`, no slant                                                                                                                                                                              |
| ghost rank / ghost total, `EnergyStreak`, club glow             | removed; the club arrives as `clubStyle(teamAsClub(team))` + `ui.edge.start` (row or hero card) or `ui.club.fill` (podium band)                                                                                                                                                     |
| `TiltFrame` photo                                               | `PlayerPhoto size="xl"` or `PepitesShirt` in a `UiCard`; no tilt                                                                                                                                                                                                                    |
| leaderboard row (inline `kit.primary` edge, mono meta)          | interactive `UiCard` with `ui.edge.start` under `clubStyle`, `PlayerPhoto size="md"`, name `ui.text.bodyStrong`, meta `ui.text.meta` muted, rank `ui.score.row`, score `ui.score.sm` ink                                                                                            |
| ranking grid / desktop table (`min-w-[1120px]`, `bg-[#e8ecfb]`) | `UiTable`/`UiTHead`/`UiTBody`/`UiTR`/`UiTH`/`UiTD numeric`; rows ≥ 48px; `PlayerPhoto size="xs"`; sort buttons at `ui.space.tap`; position as `UiBadge`                                                                                                                             |
| desktop `<select>` filters (`min-h-9`, `bg-white`)              | `UiChip` row + `UiSelect`                                                                                                                                                                                                                                                           |
| podium (gradient cards, `rounded-2xl`, white/15)                | three `UiCard`s, a `ui.club.fill` band under `clubStyle`, `PepitesShirt`, `ui.score.md`                                                                                                                                                                                             |
| player tabs (custom tablist)                                    | `UiTabs idBase="pepites-player"`; panel `aria-labelledby={`pepites-player-tab-${tab}`}`                                                                                                                                                                                             |
| profile items, "Non renseigné" in `#ffb020`                     | `ui.text.label` muted over `ui.text.bodyStrong`; the missing value in `ui.tone.faint` (or `UiBadge tone="neutral"`)                                                                                                                                                                 |
| edition chips (`min-h-[32px]`)                                  | links at `ui.space.tap` (`UiLinkButton size="sm" variant="soft"`)                                                                                                                                                                                                                   |
| rating trend (two copies, literal SVG colours, phone CSS flip)  | one chart component: oldest point at the inline start, direction computed in code, grid `--ui-rule`, labels `ui.text.micro` muted, line `--ui-ink-fg`, dots `--ui-rating-N`, average dashed faint                                                                                   |
| match log (two copies; score as one `dir="ltr"` string)         | one list that keeps `<ul>/<li>` (`pepites-player-matches`); the score as three flex children each in its own `<bdi>`                                                                                                                                                                |
| face-to-face card (`bg-[#1b2a6b]`, "→")                         | `UiCard` with `ui.surface.inkPlain` only if a navy block is wanted, otherwise a plain card; lucide `ArrowRight`                                                                                                                                                                     |
| breakthrough bars (energy fill)                                 | shared `FillBar` (first half `fill="faint"`, second `fill="ink"`); the "×" figure in `ui.score.md` ink                                                                                                                                                                              |
| compare bars (energy / `#1b8f55` winners)                       | winner bar `--ui-ink-fg`, other `--ui-surface-sunken`, `ui.radius.track`; winner figure `ui.tone.positive`, figures `ui.stat.sm`                                                                                                                                                    |
| "VS" in energy text                                             | removed, or a dictionary key in fr and ar, in `ui.text.label` muted                                                                                                                                                                                                                 |
| compare portraits (`rounded-lg/xl`, "＋")                       | `UiCard` buttons with `PlayerPhoto size="lg"` and a lucide `Plus`; `data-testid="pepites-compare-cards"` on their container                                                                                                                                                         |
| compare picker input (`h-10`)                                   | `UiInput type="search"`; rows `UiPlayerRow`                                                                                                                                                                                                                                         |
| share trigger with `onNight` (glass)                            | `onNight` off (the soft variant on light cards)                                                                                                                                                                                                                                     |
| Follow button (glass) and white retry link                      | `UiButton variant="soft"` / `"ink"` with `aria-pressed`; retry at `ui.space.tap`                                                                                                                                                                                                    |
| Reveal (radial night page, 330px ghost, 8px mono glass tiles)   | light kit page: progress in `--ui-ink-fg` over sunken, the photo or shirt in a `UiCard` (`ui.radius.sheet`), three `UiStatBlock`, `UiLinkButton variant="gradient"` + `"soft"`, bottom safe-area inset                                                                              |
| admin kicker, 8–10px headings, coverage tiles, `#b86e00`        | `ADMIN_LABEL_CLASS`, `AdminSectionHeading`, `ADMIN_PANEL_CLASS`/`ADMIN_CARD_CLASS`, `UiStatBlock` with a bar in status tokens, `UiButton size="sm"`, `UiBadge tone="caution"`                                                                                                       |
| admin status pill (hex), schedule button (`to_right` gradient)  | `UiBadge tone={statusTone(status)}`; `UiButton variant="gradient"`                                                                                                                                                                                                                  |
| admin `ReasonField` (raw 38px textarea)                         | `UiTextarea`                                                                                                                                                                                                                                                                        |
| "DATA", "U23" literals                                          | removed, or dictionary keys in fr and ar                                                                                                                                                                                                                                            |

### Tokens

| Pépites token                                                | Kit token                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `--pepites-page`                                             | `--ui-page` (the shell paints it)                                                                |
| `--pepites-card`, `--pepites-*-shadow`                       | `ui.surface.card` / `UiCard`                                                                     |
| `--pepites-ink`, `--pepites-text`                            | `ui.tone.ink` (`--ui-ink-fg`), `ui.tone.default`                                                 |
| `--pepites-muted`                                            | `ui.tone.muted`                                                                                  |
| `--pepites-line`, `--pepites-divider`                        | `ui.rule.*` (`--ui-rule`; a control edge `--ui-rule-strong`)                                     |
| `--pepites-seg-empty`                                        | `--ui-surface-sunken`                                                                            |
| `--pepites-rating-1..5`                                      | `--ui-rating-1..5` with `--ui-on-rating-1..5`                                                    |
| `--pepites-spring`, `--pepites-energy*`                      | `ui.tone.positive` for a gain; `--ui-grad-action` only through `UiButton`/`UiPill tone="action"` |
| `--pepites-night`, `--pepites-on-night*`, `--pepites-violet` | none: no night surface remains                                                                   |
| `--pepites-missing`                                          | none on public screens; admin shows photo status with `UiBadge`                                  |
| `--pepites-font-mono`                                        | none on screens (kept only for the share-image canvas)                                           |
