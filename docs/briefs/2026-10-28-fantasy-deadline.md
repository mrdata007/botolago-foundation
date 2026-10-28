# Fantasy hub: a deadline card that follows the game (screen brief)

Owner-approved fix from the design critique of 2026-10-28 (finding "Fantasy hub
headlines passed J5 deadline; actionable J6 deadline in small print"; owner
decision 2026-10-28: "everything listed"). Branch `claude/dc-fantasy-deadline`.
Scope: the Fantasy hub, `src/routes/fantasy.index.tsx`, the deadline card
(`src/components/fantasy/DeadlineCard.tsx`), its state logic
(`src/components/fantasy/gameweek-presentation.ts`), the hub's own cards
(`FantasyGuestIntro.tsx`, `FantasyHubPersonal.tsx` only where a link or action is
removed or demoted) and the strings in both dictionaries.

Open PRs checked first: #436 (renders public Fantasy before JS) touches
`fantasy.tsx` and the other Fantasy routes but not the hub card, so no overlap;
#460 (pending scoring) is backend only; #506 (UX copy) edits the dictionaries,
so the new keys are added together in one block next to `fantasy.next_deadline`
to keep a merge trivial. Nothing is duplicated.

## What must be preserved

- Every deadline comes from the server (`gameweek.deadline`,
  `gameweek.enrolment.deadline`). The card presents them; it never computes,
  shifts or invents one. Dates are written in Morocco time
  (`formatDeadline`, `src/lib/morocco-time.ts`).
- The kicker element "Journée N · Date limite" stays ONE element with that exact
  text (the Fantasy e2e journey finds the hub by it).
- Fantasy rules, scoring, the gameweek lifecycle, squad building, transfers and
  points are untouched. `fantasyNextAction` (the owner's one primary action) and
  `nextDeadlineAfter` keep their meaning.
- The owner's checklist (starters, captain, starters without a match), the two
  owner links (team, transfers), the team card, "Mes ligues", reminders, the News
  rail and the prize welcome.
- The guest proposition's content and its one gradient button "Créer mon équipe".
- French and Arabic (RTL, logical start/end only, Latin digits), 44px tap targets,
  skeleton heights that avoid layout shift.

## Improvements

1. **Headline follows the game state** (main item). A pure function in
   `gameweek-presentation.ts` (`deadlineHeadline`) decides, from the server's
   gameweek and the clock, which of three states the card is in:
   - `open`: the round's deadline is ahead. Headline is that round and its
     deadline, with the time left. No sub-line.
   - `next_open`: the round's deadline has passed and the server names a next
     round whose deadline is still ahead. Headline is the next round: "Journée 6 ·
     Date limite", the date, the time left ("dans 2 j 1 h"). The round that
     passed drops to a sub-line: "Journée 5 en cours" (or "Journée 5 terminée" once
     finalised, "Journée 5 annulée" when cancelled).
   - `awaiting_next`: the deadline has passed and no later deadline is published.
     The card says so in words: round state plus "La prochaine date limite n'est
     pas encore publiée". No date, no countdown, nothing invented.
2. **Live dot only for a match really in play.** The dot (and the word "En
   direct") appears only while the app's live-match list (`useLiveMatches`, the
   query the live strip uses) holds a match of that round. Otherwise the sub-line
   says the round is in progress, with no dot. A live list that has not loaded or
   failed shows no dot.
3. **Earned gradient, and a screen that is alive (owner decision 2026-10-28).**
   DESIGN.md's Earned Gradient Rule lists the primary button, the active nav
   pill, the deadline pill, progress, a selected Fantasy plate and the promo
   card; a full-width slab is not on it. The card becomes a deep navy stage in
   both themes, with the countdown as the loudest thing on the page: "Journée 6"
   in the 46px Changa display step, and the three countdown tiles in 40px Changa
   score digits on glass tiles. The tiles read days, hours and minutes from a
   full day out ("02 jours 00 heures 41 minutes"), hours, minutes and seconds
   inside the last day (padded with Latin digits as before). The gradient stays
   on the one primary button ("Créer mon équipe" / the owner's next action). To
   keep the rest of the hub from being a pale stack: the shortcut and "En savoir
   plus" icon discs and the four "how it works" discs are navy (they were grey
   washes and four extra gradient discs), and the visitor's secondary links are
   flat pills.
4. **One primary action, one rules link.** For a visitor "Créer mon équipe" is the
   one gradient action; "Classement général" and "Créer ou rejoindre une ligue"
   become slim secondary links. "Règles du jeu" appears once for a visitor (the
   link under "Comment ça marche"; the "En savoir plus" list keeps it for owners,
   who have no such card), and "Aide & Règles" is renamed "Questions fréquentes"
   in that list so it no longer repeats "Règles".
5. **Desktop width.** The hub uses the wide Fantasy canvas (`width="wide"`, the
   1024px token) and from `lg` a two-column board: deadline card, proposition or
   team card and the round on one side; shortcuts, leagues, News and "En savoir
   plus" on the other. Phones keep today's single-column order exactly
   (`display: contents`).

Not changed: the owner's team card keeps its gradient (it is the owner's identity
card and cannot be checked without an account; flagged for the owner).

## Acceptance criteria

- Unit tests on `deadlineHeadline` prove the headline in each state: before the
  deadline; deadline passed with matches still to play (next round named); round
  live (dot only with a live match); round finished with a next round; between
  rounds with no next round published (honest message, no date); registration
  closed; cancelled; unparsable date.
- French and Arabic (RTL), light and dark, at 320, 390 and 1440px: no element
  crosses the viewport edge (measured with element boxes, not `scrollWidth`
  alone); the card is navy and the only gradient object above the fold is
  "Créer mon équipe".
- With the live data of 2026-10-28 (J5 deadline passed, J6 on 30 Oct 17:30) the
  card reads "Journée 6 · Date limite", "ven. 30 oct., 17:30", the time left, and
  "Journée 5 en cours".
- Relevant existing tests pass; changed expectations (the card pins, the hub order pin) are
  updated, new logic has tests.
