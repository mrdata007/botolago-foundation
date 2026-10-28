# Matches calendar: a matchday that feels full (screen brief)

Owner decision 2026-10-28: "everything listed" from the 2026-10-28 design
critique, matchday first. Lane 3 of 7, branch `claude/dc-matches-list`. Scope:
the Calendrier tab, `src/routes/matches.index.tsx`, the day strip
(`DateStrip.tsx`), a new round summary component, and the pure helpers next to
them. Not in scope: the match page, `StandingsTable`, `MatchCard` and the
reminder bell, Home.

Checked first: PR #573 (speed and stability) touches nothing under
`src/routes/matches.index.tsx` or `src/components/matches/`. PR #578 (Arabic
first) changes the route loader of `matches.index.tsx` (language-aware
prefetch). This lane leaves the loader untouched, so the two merge without a
conflict in that block. Nothing in either PR solves the four items below.

## What must be preserved

- The page's order and the shell's sticky bands: title and season picker,
  Calendrier / Classement / Pronostics tabs, live strip, status chips, then the
  date band and its day chips.
- The date band (arrows step one day, "Aujourd'hui · Journée 5", the Today
  shortcut), the chips' keyboard behaviour, RTL mirroring of the chevrons,
  44px targets, competition-calendar (Casablanca) days.
- The day's rows (live and to come in one card, results under their own
  heading), the live strip's newer reading on the rows, polling rules, the
  language-switch placeholder, the loader and its SSR availability.
- The empty-day state with its "Prochains matchs" / "Derniers résultats" links
  and the next day's rows under it. Unchanged.
- Data honesty: a count is a count of rows that exist; nothing is guessed, an
  unknown kick-off hour is left out, never shown as 00:00.
- The phone layout, apart from the additions below. No new colours, fonts or
  data sources: only the season fixture list the table already reads
  (`getSeasonFixtures`) and the queries the page already runs.

## Improvements

1. **Round summary under the day's rows (the main item).** A compact navy
   band (owner direction, below) "Journée 5": the number of matches in the
   round, then big Changa counts: played, to come (and live, called off, only
   when there are some) and "Ce jour" (the rows listed for the day), a progress
   bar, and the next kick-off of the round (date and hour; the hour is left out while the
   provider's placeholder hour stands). When nothing is left it says the round
   is over. "Voir toute la journée" opens the whole round, grouped by day, as
   the same match rows (links to each match). Counts come from the round's
   matches in the season fixture list, with the selected day's rows (which
   carry the live strip's reading) laid over them, so the figures and the rows
   always agree. Postponed matches with no confirmed date are counted as still
   to come and listed under "Date à confirmer", never under a made-up day.
   Matches called off are counted on their own, only when there are some.
2. **Day strip marks the days that have matches.** A small fresh-turf dot (with
   a hairline deep-navy ring, so it holds on a light chip) under the number
   of every chip whose day has a match in the season fixture list, plus a hidden
   label for assistive tech ("jour de match"). Days without a dot have none. The
   dot row keeps its height while the list loads, so the chips do not jump.
   Keyboard, RTL and the scroll-to-centre are untouched.
3. **"Résultats" no longer lies.** Choice: the chip stays a per-day filter
   (like "Tous"), and when the selected day has no finished match but the round
   does, it shows the round's results grouped by day (newest first) under a one
   line note "Aucun résultat ce jour. Résultats de la Journée 5". Why not
   round-wide always: a reader who picked Saturday and pressed "Résultats"
   still gets Saturday's results when there are some; the page never jumps to
   other days without saying so. The same false empty existed on "À venir" (a
   day whose matches are all finished) and gets the same treatment. "En direct"
   keeps its own empty line, which is true. While the season list is still
   loading the page shows skeleton rows, not an empty state. If the round has
   nothing either, the old "Aucun résultat pour l'instant" stays: it is then
   true.
4. **Desktop uses its width.** From 1024px the page takes the wide canvas the
   Classement tab already uses (the header bands follow it) and splits in two:
   the day (date band, chips, rows) in the main column and, beside it, the round
   summary with the whole round listed under it (always open there). Below
   1024px the summary sits under the day's rows and the full round opens on
   demand. A table beside the matches (mini standings) was considered and left
   out: it belongs to the Classement lane's component, and the round summary
   already answers "where are we".

5. **Live rows lit.** Matches in play sit in a card of their own above the day's
   other rows: a live-red ring and a tinted header with the breathing dot and
   "En direct maintenant". Without a live match nothing changes.

Owner direction 2026-10-28, "not too pale, more alive, on brand", applied: the
round summary is a navy band (the date band's own navy) with Changa figures in
the score ramp, the "Ce jour" and live figures in fresh turf, and the action
gradient only on its progress bar (an allowed use); the day strip's marker is
fresh turf; the live card is lit in the live colour. No new colour, font or
image. The round list under the band stays on the club-colour rows.

New strings, French and Arabic: `matches.round.*` and `matches.date.has_matches`
(Arabic counted forms for one, two, 3-10 and 11+, like `standings-copy.ts`).

## Acceptance criteria

- Visual, French and Arabic (RTL), light and dark, at 320, 390 and 1440px: no
  element crosses the viewport edge (measured on real element boxes, not
  `scrollWidth` alone); the summary and the dots read at AA; the 390px page is
  the old page plus the summary card.
- On 28 October (Journée 5) the summary counts equal what the rows show: its
  played and to-come figures add up to the round's total, and "Ce jour"
  equals the number of rows listed for the day.
- A day with matches shows its dot, a day without none; the arrows and chips
  still move the day; the active chip is still centred, also under RTL.
- "Résultats" on a day with no finished match, inside a round that has some,
  lists them under day headings with the note; on a day that has results it
  lists only that day's; on a round with none it says so.
- The empty-day state is unchanged and still offers the next and latest days.
- Tests: `DateStrip.test.tsx` (marker), `match-day-query` tests and
  `matches-calendar` tests pass; a new `match-round.test.ts` covers the round
  maths (counts, overlay, grouping, next kick-off, day set).
