# Small fixes: reminder bell, club names, Clubs page, Prospects wording (screen brief)

Owner-approved scope, 2026-10-28 ("everything listed"), from the design critique of
the live site (`.impeccable/critique`, priority P2/P3 items). Lane 7 of 7, branch
`claude/dc-small-fixes`. Screens: `docs/screens/2026-10-28-small-fixes/`.

Files in scope: `MatchCard.tsx`, `MatchReminderBell.tsx`, `src/components/clubs/*`,
`src/routes/clubs*.tsx`, `src/components/pepites/*` and `src/routes/pepites*.tsx`
(content only; the Prospects back link in the header belongs to another lane),
`src/components/predictions/*` (club names only), the shared club-name helper in
`src/lib/club-identity.ts` and the club table in `src/lib/kits.ts`.

Open pull requests read first: **#375** ("one name and code per club, Morocco-time news
dates…", open, conflicting with `main`) already holds the club-naming fix: a
`ClubIdentity` (code + short name in French and Arabic) written once per club in the
club table, and `clubShortName` / `withClubIdentity` helpers. Only that part is ported
here, onto current `main` (the table, the two helpers, their tests); credit: #375. Its
news-date, goal-difference, palette-clash and rankings changes are not touched. #506
(UX copy) and #446 (« prix ») do not touch these files' strings in a way that conflicts.

## What must be preserved

- Brand, tokens and the ui-kit: no new colours or fonts. Club colours keep the
  palette's contrast guarantees (`club-palette.ts`).
- Every business rule: the Prospects score, ranks, editions and the weekly Top 10 are
  shown exactly as the server sends them. Nothing is computed that was not before.
- Data honesty: an unknown figure stays a dash, never 0. No odds-like rows.
- The name « Prospects » / « المواهب » (owner decision 2026-10-15) and the Arabic
  Top 10 label: « توب 10 » is an open owner decision, so its wording does not change;
  only how it wraps.
- Match rows: kick-off, score, status, live bar, 44px tap targets, club-colour edges.
- Player names keep the spelling the data holds (no Arabic player names exist: see
  item 5).
- French and Arabic (RTL, logical properties, Latin digits, no Arabic letter-spacing),
  light and dark, 320 to 1440px, no horizontal overflow.

## Findings and improvements

1. **Reminder bell.** Inspected: the bell saves a match subscription on the server, and
   its toast already says only what is true for the account's own settings. What
   the app cannot see is whether anything is sent: the global e-mail mode is not
   readable by the client (`docs/backend/EMAIL_NOTIFICATIONS.md`, "Known gap"; no
   public flag, RPC or env setting exists) and PRODUCT.md records e-mail `off` and push
   `off`. So a visitor is offered a bell that may do nothing. Change: the bell is
   hidden behind one named switch, `MATCH_REMINDERS_DELIVERABLE` in
   `src/lib/feature-flags.ts` (false), so it comes back by flipping one constant once
   delivery is confirmed live. No server code. The row loses its right padding for the
   bell.
2. **One short name and code per club.** The sixteen current clubs get one code and one
   short name (French and Arabic) from the club table; `presentFootballClub` applies it
   so tickers, match cards, stories and Pronostics print "RCA", "FAR", "HUSA", "WAC",
   never "ASFAR" or "WCA" for the same club. Call sites in this lane's files (match card,
   clubs, Prospects, Pronostics) read the one helper.
3. **Clubs page denser, colour stronger.** 16 clubs currently take about three phone
   screens of tall tiles with a thin bottom rule in the club colour. Becomes a compact
   grid (three columns on a phone, crest above a short name) whose tile is filled with the
   club colour (see the owner direction below), from the existing club palette helpers.
4. **Prospects wording.** « RISING » (English) becomes « Score » in French; the
   figures line « 0B 0PD » and the tile label « B+PD/90 » become words (« Buts … ·
   Passes déc. … », « Buts+passes / 90 min »); the ten dashed segments under each row
   get a one-line key ("barre = score sur 100, un segment par tranche de 10 points").
   « Semaine 6 » is the editorial week of the Top 10 (an edition is published each week;
   `week_number`), while the rest of the app counts journées; the edition was computed
   after journée 5. The title stays « Semaine 6 » and the home page now says
   « Après la journée 5 » next to it. The Arabic « توب 10 · الأسبوع 6 » no longer leaves
   a bullet at the end of a line: on a phone the two parts stack with no bullet.
5. **Arabic player names.** The data carries none: the V2 catalogue's `app.players`
   holds `display_name` / `full_name` only, the Prospects DTO has one `name`, and
   `docs/backend/FANTASY_PLAYER_MAPPING_TABLE_AND_REVIEW_SCREEN_DESIGN.md` D5 records
   "no separately curated Arabic player-name spellings in v1". `name_ar` exists only on
   the legacy table in `src/integrations/supabase/types.ts`. Nothing changes; reported.

## Owner direction 2026-10-28: "not too pale, more alive, on brand"

Added after the first version of this brief; it supersedes the "thin colour rule" look
of both screens. How it is applied, with existing tokens only:

- **Clubs page:** each tile is filled with the club's own colour (`clubStyle` tokens,
  `ui.club.fill`, the diagonal `club-stripes` texture, text measured for the fill, an
  inverse crest plate, and the inner edge ring so a white kit such as Zemamra stays a
  tile). Three across on a phone, four from `sm`, six from `lg`. Dark mode takes each
  club's calmer dark answer from the same palette; nothing is added to the palette.
- **Prospects rows:** the score is the loudest figure of the row (the `md` score ramp
  instead of `sm`) in the club colour as text (`--ui-club-fg`, 4.5:1; plain foreground
  in dark), the ten segments are lit in the club's edge colour, and the figures line
  reads in the main text colour rather than muted grey. The leader's navy band stays
  as the screen's anchor; no gradient is added.

## Acceptance criteria

- Visual: French and Arabic (RTL) at 320, 390 and 1440px, light and dark: no element
  crosses the viewport edge (real element boxes measured, not `scrollWidth` alone).
- Match rows show no bell; flipping `MATCH_REMINDERS_DELIVERABLE` to true restores it
  (a test pins both the switch and its default).
- The sixteen codes and short names are unique; a test fails on a duplicate; Wydad is
  "WAC"/"Wydad", FAR is "FAR", never "WCA"/"ASFAR".
- `/clubs` at 390px fits in about half the previous height; each tile shows the club's
  colour clearly; colours come from `clubStyle`/the palette, text contrast unchanged.
- Prospects shows no English score label in French or Arabic; no "0B 0PD"; the Top 10
  title has no dangling bullet at 320 and 390px in Arabic; the key line is present in
  both languages.
- `bunx tsc --noEmit`, eslint and prettier on changed files, and the related tests pass.
