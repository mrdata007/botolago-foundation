# Fantasy leaderboard redesign (screen brief)

Owner-approved Phase 3 proposal `Leaderboard.dc.html`, 2026-10-27. Branch
`claude/p4-leaderboard-redesign`. Scope: `src/routes/fantasy.rankings.tsx`,
`src/components/fantasy/MyRankCard.tsx`, `src/components/report/ReportNameMenu.tsx`
and their copy in both dictionaries.

## What must be preserved

- The Général / Journée / Mes ligues tabs, the search field (with its
  "searched the first N of M" note), pagination and the "go to my position"
  control.
- The empty state before the first gameweek is scored (never a spinner or an
  error), the error state with retry, and the four "my rank" states
  (ranked, unranked, no team, pending).
- The table stays a `<table>`: rank, manager, gameweek, total, movement.
  Ranks, scores, movement and server order are untouched; no client-side
  re-ranking.
- "Signaler" still works, with the same mail targets, and is never offered on
  the reader's own row.
- Fantasy rules, scoring, the gameweek lifecycle and every business rule; the
  brand, fonts and tokens. Logical CSS, RTL mirroring, 44 px tap targets.
- No sponsored "Défi" tab: it needs a backend and an admin switch, so it is
  not built.

## Improvements

1. **"En attente" instead of 0.** While the current gameweek's points are
   provisional (the existing `pointsState` / `status` of
   `getCurrentGameweek`) a row whose gameweek score is 0 shows "En attente"
   in the gameweek column, with the same text for screen readers. Once the
   gameweek is final, 0 is a real 0. The rankings API has no per-row
   "waiting" flag, so the signal is gameweek-wide; a manager who really
   scored 0 inside a provisional round also reads "En attente" until it is
   final.
2. **Rank movement.** The column already shows ▲N / ▼N / "=" with a
   screen-reader name, and a dash when the server has no earlier rank. It is
   kept and pinned by a test; nothing is invented.
3. **The flag icon.** The unlabelled flag becomes a three-dots row menu button
   named "Signaler « nom »"; the menu entries show the visible labels
   ("Signaler l'équipe", "Signaler le manager") as before.
4. **Own rank first, "Autour de vous".** The own-rank line is already first
   and the own row is highlighted. The API has no "around me" call, so the
   screen reads the page that holds the manager's rank (same board reader,
   same cache) and shows up to two rows either side as "Autour de vous",
   only when the manager is ranked, not searching, and not on the page being
   shown. Missing backend piece, to be reported: a dedicated "standings
   around my rank" RPC (this approach is limited to the neighbours inside one
   page of 25).
5. **"Invitez vos amis" card** on a small board (20 managers or fewer) for a
   manager who owns a team, linking to the existing league hub
   (`/fantasy/leagues`) where private leagues and invite links are created.

## Acceptance criteria

- Visual: FR and AR, 360 px and 1280 px; no horizontal overflow at 320 and 360
  px (bounding boxes against the viewport); added tap targets at least 44 px;
  smallest new text 12 px; the tabs, header and table look as before apart from
  the changes above; RTL mirrors with logical CSS.
- Functional: signed-out visitor sees the board, the empty state and the error
  state as before; no "Autour de vous", no invite card for a visitor without a
  team; "En attente" only while the gameweek is not final; the menu opens and
  its entries still open the mail draft; typecheck, lint and the i18n and
  related tests pass.
- Signed-in views cannot be screenshotted (2FA); they are covered by unit
  tests of the pure helpers and source tests.
