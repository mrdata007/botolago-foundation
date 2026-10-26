# Home: matches first, Fantasy as a card, nav always visible (screen brief)

Owner-approved Phase 3 proposal `Home.dc.html`, 2026-10-26. Branch
`claude/p4-home-redesign`. Scope: the Home route `src/routes/index.tsx`, the
Home components (`src/components/home/*`, the signed-out landing's place on
`/`), and the primary navigation (`src/components/shell/primary-nav.ts`,
`BottomNav.tsx`).

## What must be preserved

- SEO and meta on `/`: title, description, Open Graph and Twitter tags,
  canonical link, JSON-LD, the sr-only H1, server-rendered matches, clubs,
  news and table.
- The language chooser: a first-time visitor still gets the mandatory
  `FirstLaunchLanguage` gate, with the same behaviour.
- The stories rail (`HomeStories`), the gameweek band with its carousel and
  live card, "Mes clubs", day chips, Pronostics card, Fantasy alerts, the
  standings snapshot with its legend and notes, the discovery tiles.
- Signed-in Home content: the Fantasy summary card and its next action.
- `/jouer` keeps the full landing page (its own address, unchanged).
- Fantasy rules, scoring, deadlines, the gameweek lifecycle, the brand
  identity (logo, navy, mint-to-cyan gradient, fonts).
- Nothing invented: scores, times and dates come from real data.

## Improvements

1. A signed-out visitor on `/` no longer gets only a full-screen Fantasy
   advert. Home opens with the matches (gameweek band, live card, next
   matches with their reminder bell), then the Fantasy invitation as a card,
   then the news, then the standings snapshot. The full-screen landing page
   stops replacing Home on `/`; the signed-in order is the same.
2. Fantasy invitation card for a visitor without an account: kicker, title,
   the real next deadline (date and time, Casablanca clock; left out once it
   has passed), "Créer mon équipe", and the free-to-try note. When no team
   can be created now the card leads to the player list as before.
3. Live card freshness: "Mis à jour il y a X min" from the real read and data
   timestamps (the same rules as the match page: fresh, stale, refresh
   button). No timestamp, no line.
4. A day with no match shows the next match day: "Pas de match aujourd'hui,
   prochaine journée : mercredi 28 octobre", from the fixtures already loaded.
5. Bottom navigation always visible on Home (it was missing under the landing
   page), and Matches moves to second place: Accueil, Matchs, Fantasy, Actus,
   Curva (`primary-nav.ts` and its tests).
6. An error in one section shows only that section's retry (matches, news,
   standings, Fantasy each already own their error state; a test now pins it).

Not built: the sponsor card (a later feature with an admin switch). The mock-up's
"EXEMPLE" score and times are not copied; everything is real data.

## Acceptance criteria

- Visual, mobile 360 and 320 px and desktop 1280 px, French and Arabic (RTL):
  a signed-out first visit shows the band and matches before any Fantasy
  content, the Fantasy invitation card follows, the bottom bar is visible with
  Matches second; no horizontal overflow; added tap targets at least 44 px;
  new text at least 12 px; arrows mirrored, numbers in `<bdi>`.
- Functional: the language chooser still opens for a new visitor; the live
  card names its freshness and turns to a stale notice when the read is old;
  a no-match day names the next match day; a failing section shows only its
  own retry; `/jouer` still renders the landing page.
- Tests: `primary-nav` order, the Home structure test, the new freshness and
  next-match-day logic, i18n keys matching in both languages.
