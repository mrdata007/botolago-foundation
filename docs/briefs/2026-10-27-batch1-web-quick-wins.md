# Batch 1 – website quick wins: screen brief

Owner approval: 27 Oct 2026 (Phase 2 plan, Batch 1, website branch). Branch
`claude/batch1-web-quick-wins`, from `origin/main` at `f98a803`. Finding codes
are from `docs/review/phase1-2026-10-27/` and the Phase 3 specs
(`mobile-spec.md`, `design-system.md`), which live on
`origin/claude/phase1-audit-log` and are not merged here.

## What was inspected before writing this

- Line-up rows (`src/components/matches/LineupsView.tsx`: pitch discs, bench
  pills, team list) and squad rows (`src/components/clubs/ClubSquad.tsx`): plain
  elements, no link. Both carry the football player id (`app.players.id`), not
  the Fantasy player id (`app.fantasy_players.id`) that
  `/fantasy/players/$playerId` expects. The pool read
  (`api.fantasy_player_pool`) returns both (`footballPlayerId`), so the link is
  made through that read; a player not in the Fantasy pool has no link.
- The Fantasy hub for a visitor (`FantasyHub*`), `/fantasy/rankings`, the
  leaderboard's name handling for anonymous readers.
- The pick-team, join-league and club overview wordings and their dictionary
  keys; the title pattern in `src/routes/pepites.index.tsx`.
- The root viewport meta, the form-field sizes in the UI kit, the type tokens
  (`--ui-text-micro` 11px, Arabic overrides), the chips named by the audit
  ("Journée double", "NOUV.", "Blessé", rank-change arrows).
- `useFantasyAvailability` (60 s poll) and `src/lib/match-refresh.ts` (browser
  live interval).
- Before screenshots (mock data, this worktree's dev server on port 5471) at 320
  and 390 (1280 for Home), French and Arabic.

## What must be preserved

- The Fantasy pitch and jerseys: no pixel changes (owner rule). The type-size
  change is excluded from the pitch if it would alter a pitch label.
- Brand colours and every existing token value. New colour tokens are additions
  and are used only as text colour.
- Fantasy rules, scoring, the gameweek lifecycle, prizes, every business rule.
- No new route, no API, database, migration or Edge Function change. The
  leaderboard API is not changed: it already returns team names only to
  anonymous readers (verified, not altered).
- Right-to-left mirroring; logical properties only.
- `viewport-fit=cover` and the safe-area handling.
- Accessible names on every control (0 unnamed on 27 routes today).

## Improvements being made

1. U1: player names in line-ups and club squads link to the player page when the
   player is in the Fantasy pool; otherwise plain text. Rows are 44px high.
2. U18: the Fantasy hub offers visitors a link to the leaderboard
   (`/fantasy/rankings`); the leaderboard shows team names only to visitors.
3. Wording: U8 pick-team title "Mon équipe" (Arabic from the dictionary or a new
   key); U9 join-league code format under the disabled button and "Annuler"
   instead of "Terminé"; U11 "En direct" on the club's next-match card while the
   match is live.
4. M3: Arabic page titles for Home, Matches, Standings, Clubs, News, Login,
   Register, Notifications.
5. M4 and faint text: text-only tokens `--ui-positive-text`,
   `--ui-negative-text`, `--ui-live-text`, `--ui-on-surface-faint-text` and
   `--ui-control-edge`, light and dark, used on the chips and the faint text the
   audit measured below 4.5:1.
6. M1: pinch-zoom allowed (no `maximum-scale=1`); every input, select and
   textarea is 16px, so iOS does not zoom on focus.
7. M5: `--ui-text-micro` 11px to 12px; Arabic small steps one pixel larger
   (micro and label 13px).
8. M6: Terms and Privacy links on login and register have a 44px hit area. M9b:
   the Arabic countdown keeps each number and its unit together.
9. S10: availability probe no longer polls every 60 s (cache 5 min, refetch on
   focus). S9: browser live polling no faster than the server's live refresh.
10. Dead code touched: the stale "News hidden at launch" comment (U16) and the
    unused `FantasyOnboarding.tsx` if it has no importer.

## Acceptance criteria

Visual (measured, not by eye):

- No horizontal overflow at 320 and 390, French and Arabic, on every changed
  screen, by bounding boxes of all elements (not `scrollWidth`).
- Every changed chip and the faint text: contrast of rendered pixels at least
  4.5:1 in light and dark; before and after values reported.
- Linked player rows and bench pills: tap area at least 44px high.
- Terms and Privacy links: 44px effective hit area (`elementFromPoint`).
- Fields: computed font-size at least 16px on login, register, search, forms.
- Text nodes under 12px (French) / 13px (Arabic) counted before and after on
  Home, Standings at 320 and Matches.
- Fantasy pitch and jerseys: bounding boxes and a screenshot identical before
  and after.
- Before and after phone screenshots, French and Arabic; 1280 for Home.

Functional:

- Link present exactly when the player has a Fantasy player id; absent
  otherwise; no link from the anonymous leaderboard to a manager profile that
  needs sign-in.
- Visitor path Fantasy hub to leaderboard in at most 2 taps.
- Document titles in Arabic follow the `pepites.index.tsx` pattern.
- i18n tests green (every new key in both dictionaries).
- `bun run lint`, `bun run typecheck`, `bun test` (whole suite; the known
  `editorial-session.test.ts` failure is the Bun-version one).
