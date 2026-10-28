# Match page: an "Avant-match" Résumé and a calmer timeline (screen brief)

Owner decision 2026-10-28 ("everything listed", matchday first), from the design
critique of the live site. Branch `claude/dc-match-page`. Scope: the match
detail route `src/routes/matches.$matchId.tsx` and the match-detail components
in `src/components/matches/` (`EventTimeline`, `MatchScoreHeader`, a new
`PreMatchPanel` and its helper), plus copy in both dictionaries. It refines the
2026-10-27 match brief (`2026-10-27-match-redesign.md`); where this brief
differs, this one wins.

Open PRs checked: #407 (drops the pressure chart from `StatComparison`),
#373 (fan-vote wording in `src/components/predictions/`) and #471 (private match
photo drafts: Admin, Edge Functions, migration). None touches the files this
brief changes, so nothing is duplicated and nothing here conflicts.

## Inspected (origin/main, local dev server, production data, read only)

Phone 390x844 and 320, desktop 1440x900, French and Arabic, light and dark.
Before screenshots in `docs/screens/2026-10-28-match-page/`.

- Upcoming match (Maghreb Fès – RSB Berkane, tomorrow): the Résumé is the
  prediction card, then a grey box "Le match n'a pas encore commencé : pas de
  faits marquants à afficher". Nothing else on the tab.
- Finished match (UTS Rabat 0–1 Wydad, 8 substitutions folded): the goal row
  (the only goal, 9') is a wash of the scoring club's tint. For a red club that
  is pink, and reads as bad news. It is also the last row (newest first), under
  three yellow-card rows that look as loud as it.
- Score header: a round "+" under the scorer line. It opens the assists and the
  cards, but nothing says so.
- Desktop (1440): an empty left column beside the timeline, and the line-up
  pitch at half width with blank space to its right. Cause, found in code:
  `EventTimeline` returns a fragment (the "Moments forts" row, then the list),
  and inside the two-column grid of the Résumé panel its two children become
  two grid items, so the list lands in the right column and the line-ups under
  the chip row on the left.

## What must be preserved

- The club-colour split header, exactly as it is (`TeamHalf`, the score box,
  the status pill, the elapsed bar while live), the sticky score bar, share,
  and the freshness note.
- The four tabs and `?tab=` routing; the prediction card and its place
  (first on a match still to play on a phone, the right-hand column on a
  desktop); related news behind `NEWS_ENABLED`.
- Refresh cadence and freshness rules (`match-refresh.ts`,
  `match-freshness.ts`), the goal-moment takeover, the live arrival animation,
  "Moments forts", "Afficher les N remplacements", half-time and full-time
  separators, newest event first.
- The statistics note under the timeline, the per-section failure messages and
  retries, the phase-aware empty-state wording of every other state
  (`awaiting`, `unreported`, postponed, cancelled, ...).
- Fantasy, scoring and every other business rule. No server or database change.

## Improvements

1. **"Avant-match" module** replaces the grey "pas de faits marquants" box on
   the Résumé, before kick-off only (phase `upcoming`). Built only from what the
   page already loads in the browser:
   - kick-off in Morocco time (`morocco-time.ts`) and a countdown (the Fantasy
     deadline countdown helper, `Débute dans 2 h 05 min`), omitted when the
     kick-off date or hour is unconfirmed;
   - for each club, its league position and points and its last five results as
     form chips, from the season table the Face à face tab already reads (same
     query key, so one cache entry; `FormChips` is the chip the club page and the
     standings use). A club without a row, a table not read yet or not available,
     or a competition with no table: a dash, never 0;
   - the last meeting between the two clubs, from the detail payload's head-to-
     head list (finished meetings with a score only, this fixture excluded), with
     a link to the Face à face tab; the row is omitted when there is none.
     A row with nothing true to say is not drawn. Nothing is invented and nothing
     needs a new server query.
2. **Goals are the loudest event.** The goal row loses the tint wash. It
   becomes a neutral row with the scoring club's edge bar on its own side
   (the same device the standings and head-to-head rows use), a larger heavier
   name, a larger ball in the club's text colour and the navy minute pill.
   Cards become quieter rows (smaller muted name, shorter row), so a goal
   outweighs a yellow card at a glance.
3. **The "+" says what it does.** The round button becomes a labelled control:
   "+ Passes décisives et cartons" (only "Passes décisives" or "Cartons" when
   that is all there is), "×" while open, `aria-expanded`, 44px tall.
4. **Desktop balance.** The timeline is one element, so on 1024px and up the
   Résumé panel is two even columns: events on the start side and the line-ups
   on the end side, both filling their column; the pitch uses the column
   width. For a match still to play, the "Avant-match" module takes the
   timeline's column.

## Acceptance criteria

Visual, in French and Arabic (right to left), at 320, 390 and 1440 px, light and
dark: no horizontal overflow, measured on element boxes (not `scrollWidth`
alone); text no smaller than 12 px; taps at least 44 px.

- Upcoming match: the Résumé shows the prediction card, then "Avant-match" with
  kick-off and countdown, the two clubs with position, points and five form
  chips (or dashes), and the last meeting with its Face à face link. In Arabic
  the home club is on the right. No "0" stands for an unknown value.
- Finished match: no pink wash on any row; the goal row is the heaviest row of
  the list; cards read as secondary. Colour is never the only carrier: the ball
  and the label stay.
- The "+" control shows its words in both languages.
- Desktop: no empty left column; the timeline and the line-ups share the panel
  in two columns of equal width, the pitch is not stranded at half width.
- The split header is pixel-identical to before.

Functional: tabs, share, substitution switch, related news, refresh cadence and
the existing match tests pass (those that pinned the old goal tint, the "+"
button's label or the empty box are updated, and new tests cover the
"Avant-match" helpers and rendering). Club-colour contrast tests stay green.

Not verifiable here: a live match (none may be live while this is worked on).
Live and finished rendering is checked with finished matches and unit tests.
