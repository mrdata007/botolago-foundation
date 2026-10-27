# Standings (Classement): a readable, honest table (screen brief)

Owner-approved redesign, Phase 4 of the screen work: the Standings board
(`Standings.dc.html`). Branch `claude/p4-standings-redesign`. Scope: the
Classement tab, `src/routes/matches.standings.tsx` and
`src/components/matches/StandingsTable.tsx` (+ copy in `standings-copy.ts` and
both dictionaries).

## What must be preserved

- The Général / Domicile / Extérieur / Forme tabs, the season selector, the
  "Votre club" card, the "all clubs" link, the live strip and the Matches tabs.
- The table's data and ranking logic (`buildStandings`, `league-table.ts`):
  shared ranks, zone derivation (`tableZones`), points adjustments, the
  provisional / unofficial notes. No qualification rule is invented.
- The phone layout: rank, club, played, goal difference, points, with
  won/drawn/lost one press away; the zone bar on the row's start edge.
- The skeleton while loading, the empty state with the "previous season"
  button, and the retry on a failed load.
- French and Arabic (RTL), tap targets of 44px, no sponsor slot.

## Improvements

Already in the code and kept as they are (no change needed): the key under the
table that explains the coloured row edges (`StandingsLegend`, fed by the same
`ZONE_BAR` / `tableZones` source as the bars), the highlighted row for the
signed-in fan's favourite club (`highlightClubId` from `user.favoriteClubId`),
the club name opening its club page, and the Played column on phones.

New:

1. The header row stays pinned under the Matches tabs while the table scrolls
   (the card clips instead of hiding its overflow, so `sticky` can work).
2. A note "games in hand" computed from the rows: when clubs have played fewer
   matches than the busiest club, a line under the table names them (up to
   three, else the count) and points to the Played column. Overall and Form
   views only; never shown when every club has played the same number.
3. An "updated" line from real data: when this page last read the table
   ("Données chargées : date, heure", Morocco time). The standings have no
   calculation timestamp in the API, so it is worded as retrieval, never as
   "calculated"; it does not read the clock.
4. Honest error state: if a refresh fails while a table is already on screen,
   the table stays and a notice says it could not be refreshed, with a retry,
   instead of replacing the table with an error.

Not built: sponsor line (later feature); "Hors connexion · classement enregistré
{date}" of the proposal, because the app keeps no stored copy with its own date
(the notice in item 4 plus the retrieval time is the honest equivalent).

## Acceptance criteria

- Visual: at 360px and 320px, French and Arabic, no element crosses the
  viewport edge; the header row stays visible under the tabs when scrolling;
  at 1280px the table is unchanged apart from the pinned header.
- Games-in-hand note appears only when played counts differ, names real clubs,
  and is absent for home/away views and for equal counts.
- The updated line shows a Morocco-time date from the query's last successful
  read; absent before any read.
- A failed refresh keeps the table and shows the notice with a retry; a failed
  first load still shows the error state.
- Every new string exists in both dictionaries; i18n, typecheck, lint and the
  tests next to the changed files pass.
