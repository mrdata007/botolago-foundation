# Brief: Classement Curva (ranking of managers by Manager Card rating)

Approved screen work (AGENTS.md, "Screen work"), owner approval of 2026-10-12.
Written after reading the existing Curva screens (`src/routes/curva.*.tsx`,
`src/components/curva/`: `CurvaHome`, `CurvaPeoplePage`, `PeopleBlock`,
`LeagueRows`, `people.ts`, `use-curva-people.ts`), the Manager Card read layer
(`src/backend/manager-card/contracts.ts`, `supabase-repository.ts`,
`src/services/use-manager-card.ts`, `supabase/migrations/20261010120200_manager_card_api_v2.sql`)
and the Fantasy overall board (`fantasyService.getGlobalRankings`), and before
the first interface change.

No backend change. No migration, no script, nothing run against any database.

## Product decision this brief records

`docs/product/MANAGER_CARD_SECTION_PLAN.md` (sections 4.5 and 4.9) listed "a
league or global ranking by OVR" as not built ("display-only"). The owner has
now approved exactly that screen. This brief supersedes those two lines; a
note to that effect is added to section 4.9 of the plan. « Les vôtres » keeps
its own rule (the league's points order, never re-sorted): `people.ts` and its
tests are untouched, and the new ranking is a separate module.

The page is presented as a ranking and nothing else. Its copy says "Classement
Curva" / «ترتيب الكورڤا», and states no prize, no stake and no "just for fun"
disclaimer (owner instruction).

## What must be preserved

- « Les vôtres » (`/curva/les-votres`), the Curva home, the card page and the
  seasons page: behaviour, copy, tests. The only edit to an existing screen is
  one link to the new page.
- Everything in `src/components/manager-card/` (another lane is editing it):
  read only, imported, never edited.
- The read layer: `useManagerCards` (batch read, `unavailable` when reads are
  off), the Curva layout's redirect to Fantasy when the section is off, the MFA
  step-up the API enforces, `noindex` and `private, no-store`.
- Which accounts appear: whatever the server returns. The API leaves out
  unknown teams and hidden profiles; the overall board is the existing public
  board. No client-side filtering is added.
- Fantasy rules, scoring, the gameweek lifecycle, the Manager Card calculation
  and the brand identity. The page reads, and never writes.
- Design system V2 (kit primitives, `ui.*` tokens, logical properties, 44px tap
  targets), French and Arabic with RTL, the public editorial rule (no AI notice
  anywhere on the screen).

## Data

| View     | Source                                                                                                                                                                                      | Notes                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ma ligue | The user's private leagues (`usePrivateLeagues`) and the chosen league's standings (`fantasyService.getLeagueStandings`, same query key as « Les vôtres »), then `useManagerCards(teamIds)` | Exactly « Les vôtres »' source (`useCurvaPeople`). League picker (chips) when there are several; the remembered league is the default.                                                                                                                                                                                                                                         |
| Tous     | The Fantasy overall board (`fantasyService.getGlobalRankings`, backed by `api.fantasy_overall_standings`, which returns team ids), then `useManagerCards`                                   | An API that lists public team ids already exists, so the view ships. It is bounded: the first 100 managers of the overall points board, because the card read takes 100 ids per call and ranks only what it is asked about. The page says so in one line. A complete all-managers ranking by OVR needs a server-side list endpoint, recorded under "Not done / needs backend". |

Ordering, done on the client from the card read (the rows carry the OVR):

1. Rated cards (OVR present) by OVR descending.
2. Equal OVR means equal rank (1, 1, 3), then by name for a stable order.
3. Cards without an OVR follow, unranked.

Row content: position, name (the card's `name`, as the API returns it; never an
id or e-mail; a card without a name is dropped), club (short name in the
reader's language), tier, OVR, the four statistics compact, the provisional
badge, "Vous" on the reader's own row. Malformed rows (no team id, an OVR
outside 1 to 99, an unknown tier) are skipped and never crash the page.

## Decisions to justify

- Unrated cards: **listed after the rated ones, in a "Sans note" group with
  their filled-statistics count ("2/4")**, rather than hidden behind a toggle.
  Reason: early in a season most cards are unrated, so a hidden group would
  read as "I am missing" for a lot of people, and a toggle is one more control
  on a mobile screen. The count tells them how far along they are. The group
  has its own heading so it cannot be read as a continuation of the ranks.
- No link from a row: there is no route that shows another manager's card
  (`/curva/carte` is the reader's own). Rows are plain, not buttons.
- Entry point: a link row on the Curva home, below « Vos saisons ». Curva has
  no tab bar, so a "tab" would be a new navigation pattern; a link keeps the
  existing pages as they are.

## Improvements

1. A new page `/curva/classement`: "Classement Curva".
2. Two views, « Ma ligue » (default) and « Tous », as a segmented control; the
   league picker as chips when the user has several leagues.
3. A ranked list, mobile first, in a card; the reader's own row highlighted
   (tint and the 4px bar at the inline start, as in « Les vôtres »).
4. States: loading skeleton, empty (no league yet; a league with nobody rated;
   the board empty before the first gameweek), error with retry, partial (cards
   failed), and "the card system is switched off" with a polite message and a
   way back.
5. A subtle row entrance (CSS, staggered, only when the user has not asked for
   reduced motion).
6. A development-only sample route with invented data.

## Acceptance criteria

Functional

- Sorted by OVR descending; ties share a rank and the next rank skips (1, 1, 3).
- Unrated cards come after, unnumbered, each with "k/4"; they never take a rank.
- A provisional card shows the "Provisoire" badge; the reader's row is
  highlighted and says "Vous".
- A malformed or nameless row is skipped; the rest still renders.
- `unavailable` (reads off) shows the polite message, not the error panel.
- No string anywhere says "for fun", "no prizes" or names a prize; none names a
  model or an AI provider. French and Arabic have the same keys, none empty.

Visual

- At 390px and 1280px, in French and Arabic (`dir="rtl"`), no element extends
  beyond the viewport, measured from element bounding rects (not `scrollWidth`).
- Arabic is mirrored with logical properties; numbers stay left-to-right data.
- Tap targets (the view control, chips, retry) are at least 44px; names wrap
  instead of truncating.
- Text meets contrast through the kit's tokens; the provisional state is text,
  not colour alone.

Validation: typecheck, lint, prettier on changed files, the unit tests (sorting,
ties, unrated last, provisional, own row, malformed rows) and the server-render
tests in French and Arabic; before/after screenshots at both widths in both
languages. The "before" is the existing Curva people page, since the ranking is
new.
