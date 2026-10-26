# Player page: plainer labels and a bottom bar that never hides content (screen brief)

Owner-approved Phase 3 proposal "Player", 2026-10-27. Branch
`claude/p4-player-redesign`. Scope: the Fantasy player page,
`src/routes/fantasy.players.$playerId.tsx` and the gameweek chart
`src/components/fantasy-lists/PointsChart.tsx`.

## What must be preserved

- Price, points, form, minutes and selection % in the hero and key-numbers card.
- The next match card with opponent, home/away, kick-off, expected points and
  difficulty.
- The "Dernières journées" history chart, its bars, provisional hatching and
  its screen-reader sentence per bar.
- The "Prochains matchs" difficulty cards, follow (watchlist) and share.
- "Comparer" and "Recruter", their destinations and the price on the button.
- Every Fantasy rule, the scoring and the gameweek lifecycle: only wording
  changes, no data or logic.
- The wording of the rules page and the points page ("Barème ...", policy
  sentences) is not touched.

## Improvements

1. Plain scoring labels under each chart bar and in its screen-reader sentence:
   "Barème complet" becomes "Points définitifs", "Barème simplifié" becomes
   "Points provisoires", "En attente des données" becomes "En attente"; Arabic
   likewise. This needs new player-page keys, because the existing
   `fantasy.scoring.*` keys are shared with other screens.
2. The Comparer / Recruter bar gets explicit bottom clearance so it never sits
   over the last content: the content above it ends with its own padding, and
   the bar keeps the safe-area inset.
3. NOT built: the football profile (season matches, goals, assists, minutes,
   starts, average rating and last matches with score and rating). No public
   API returns it for a player: `football_player_summary` has identity only,
   `fantasy_player_gameweek_history` has points and minutes per gameweek, and
   `pepites_player_matches` is gated by the Pépites switch (off) and limited to
   its pool. Adding it needs a new RPC (listed in the report); no backend code
   is added here.

## Acceptance criteria

- Visual: chart bars read "Points définitifs / Points provisoires / En attente"
  in French and the Arabic equivalents, without overflowing at 320 and 360 px;
  desktop 1280 px unchanged otherwise.
- At the end of the scroll, the last section is fully visible above the
  Comparer / Recruter bar on mobile, in French and Arabic (right-to-left).
- Functional: all existing tests pass; the i18n key-parity test passes; the
  other screens still show their own scoring wording.
