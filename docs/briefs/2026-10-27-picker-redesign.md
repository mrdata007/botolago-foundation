# Fantasy team picker: progress by position, budget beside the choice (screen brief)

Owner-approved proposal "Picker" (Phase 3), built 2026-10-27. Scope: the first
squad selection, `src/routes/fantasy.create.tsx` and the shared
`src/components/fpl/SquadBuilderScreen.tsx`. Branch `claude/p4-picker-redesign`.

## What must be preserved

- The pitch and the jerseys, exactly as they are: `FplPitch`, `UiPitchSurface`,
  `FplPlayerCard`, `JerseyVisual` are not restyled or edited.
- Fantasy rules: 15 players (2 GB / 5 DEF / 5 MIL / 3 ATT), the 100 M budget, at
  most 3 players per club, the captain step and the team-name step.
- The navy summary strip, the "Terrain | Liste" toggle, the bottom dock
  ("Ajouter un joueur" and "Suivant") and the reset control.
- Drafts kept on the device, the visitor flow (account asked at save), the
  at-risk warning for a draft the device could not keep.
- `/fantasy/transfers` shares the screen component and must look and behave as
  today: every new element is opt-in and the transfers route does not opt in.

## Improvements

1. A progress row above the pitch: one cell per position ("GB 1/2", "DEF 3/5",
   "MIL 3/5", "ATT 2/3") saying "complet" or "reste N", computed from the real
   draft slots. The first unfinished position is marked as the next one.
2. Budget beside the choice: the strip's budget column gains a second line
   "≈ X M par place restante" (remaining budget divided by the empty places).
3. The long "La Journée 5 est clôturée. Votre équipe jouera à partir de la
   Journée 6." notice becomes one short line, in French and Arabic.
4. A deadline-passed state: when the enrolment deadline has passed
   (`evaluateDeadline`, the lock logic already used by transfers) the team stays
   visible, the slots, "Ajouter un joueur", reset and "Suivant" are locked, one
   notice says so, and saving is disabled.
5. "Suivant" explains what is missing: "Encore N joueurs à choisir" until the
   fifteen are in.

Not built: "Compléter automatiquement". The only auto-pick code,
`buildAutocompleteDraft`, rebuilds the whole squad from the cheapest players and
ignores the picks already made, so it would silently wipe a manager's choices
and give a weak team. It is not wired to any screen today; left out and reported.
Sponsor slots from the mock-up are not built either.

## Acceptance criteria

- Visual, French and Arabic (right-to-left), 320, 360 and 1280 px: the progress
  row shows four equal cells that never overflow the viewport; figures sit in
  `<bdi dir="ltr">`; text is at least 12 px; the pitch looks identical to before.
- The progress counts equal the pitch: placing or removing a player updates the
  row, and a position with all places filled reads "complet".
- The strip shows the remaining budget and "≈ X M par place restante" while a
  place is empty; with fifteen players the second line is gone.
- "Suivant" reads "Encore N à choisir" (the strip already says "N/15 joueurs"; the longer wording wrapped to three lines in the dock button) and is
  disabled until fifteen are chosen, then reads "Suivant".
- Past the deadline: one lock notice, the squad readable, slot taps, add, reset
  and next inert, save disabled. Before it, nothing changes.
- `/fantasy/transfers` renders as before (no progress row, no lock changes).
- Existing tests pass; new tests cover the progress counts, the average per
  place and the labels; the i18n key-parity tests pass.
