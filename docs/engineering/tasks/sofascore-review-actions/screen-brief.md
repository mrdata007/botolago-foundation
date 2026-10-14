# SofaScore review list: link a second ID, link any catalog player, create the player

Owner request, 2026-10-14 (approved repair). The owner reviewed 29 entries of
`/admin/football/sofascore-players` and could act on only a few of them:

- about 14 players are not in the catalog, or are not among the offered
  candidates (Felipinho 1634077 at Raja, Omar Aqzdaou 2021713, Faffa El Yazid
  1942512, Lamrany 2638716 and others). The screen offers no way to create a
  player or to pick one outside the candidates;
- five are the same person under a second SofaScore id (SofaScore keeps two
  profiles). Linking the second id is refused, because the catalog player
  already holds a SofaScore link, and one player can hold only one.

Branch `claude/sofascore-catalog-aliases`, from `main` at `af0f0fac`.

## Inspected

`src/routes/admin.football.sofascore-players.tsx` and
`src/routes/dev.sofascore-players-sample.tsx`;
`src/components/admin/sofascore-player-queue/` (`SofascorePlayerQueueScreen`,
`SofascorePlayerQueueView`, `copy.ts`, the SSR test);
`src/backend/football/identity/sofascore-player-queue.ts` (the repository and
its strict parsers) and `sofascore-player-queue-sample.ts`; the RPCs
`api.admin_sofascore_player_match_queue` and
`api.admin_resolve_sofascore_player_match`. Before screenshots of the sample
page (390 and 1280, French and Arabic) are in
`docs/screens/2026-10-14-sofascore-review-actions/`.

## What must be preserved

- The list itself: one card per SofaScore player, its facts (club, shirt, seen,
  SofaScore id, first and last seen), the reason panel and every existing
  sentence of it, in French and Arabic.
- The existing one-click confirmation of an offered candidate, its confirm
  panel, its wording and its behaviour (the card leaves the list on success; a
  refusal is shown on the card and changes nothing).
- A reader without `football.manage_mappings` sees no action button, as today.
  The database still decides every call (staff, AAL2, permission).
- Names are data: isolated (`NameText`, `⁨…⁩`), never translated.
- The admin shell, the ui-kit tokens and components (`UiButton`,
  `AdminNotice`, `AdminBadge`, `ADMIN_CARD_CLASS`, `ADMIN_PANEL_CLASS`) and the
  brand. No business rule changes: Fantasy rules, scoring, the gameweek
  lifecycle and the automatic matcher's rules stay as they are.

## Improvements

1. **Link as second ID.** A candidate already linked to another SofaScore id no
   longer ends at "cannot be chosen here": it keeps that sentence and offers
   « Rattacher comme second identifiant » / « ربط كمعرّف ثانٍ », with its own
   confirm panel that says the player keeps his main id and that this id becomes
   a second one.
2. **Find another player.** Under the candidates, « Chercher un autre joueur »
   opens a search panel: with an empty box it lists the club's current squad,
   and two letters or more search the whole catalog by name. Each result shows
   name, club, shirt, position and its SofaScore state, and offers the one
   action that fits: « Rattacher » when the player has no SofaScore id, or
   « Rattacher comme second identifiant » when he has one. Same confirm panel
   pattern.
3. **Create the player from SofaScore.** « Créer ce joueur » opens a confirm
   panel pre-filled from the entry (name, shirt, position; the club is the
   entry's club, shown, not editable). Name, shirt and position can be
   corrected. Confirming creates the player with a membership for the current
   season and his Fantasy pool entry, links the SofaScore id and closes the card.
   Without a club or a position the button is not offered and a sentence says
   why.
4. The sentence « Il n’existe pas encore de bouton pour créer un joueur » is
   replaced by one that points to the two new actions.
5. Every successful action closes the card and says that the club's held
   matches will be retried automatically (as the existing confirmation does).

## Acceptance criteria

Visual:

- 390 and 1280, French and Arabic: no horizontal overflow (measured on every
  box against the viewport, not only `scrollWidth`), buttons full width on
  phones and auto width from `sm`, panels readable in right-to-left with the
  SofaScore id and figures in left-to-right runs.
- Text contrast at least 4.5:1, read from rasterised sRGB.
- After screenshots of the same regions as the before ones, plus the search
  panel, the second-ID confirm panel and the create panel.

Functional:

- The search and the three writes go through the repository only (RPCs that
  re-check staff, AAL2 and `football.manage_mappings`); the parsers accept only
  an answer that names the pair asked for, otherwise "unavailable".
- A refusal (conflict, already resolved, not current season, …) is shown on the
  card in the reader's language and changes nothing.
- Bun tests for the parsers, the repository's argument checks, the in-memory
  sample and the view (SSR); the existing tests still pass.
