# Player page: the football profile (screen brief)

Owner-approved Phase 3 proposal "Player", 2026-10-27, the part the first
redesign left out (see `2026-10-27-player-redesign.md`, improvement 3). Branch
`claude/player-football-profile`. Scope: the Fantasy player page,
`src/routes/fantasy.players.$playerId.tsx`, one new read RPC
(`api.football_player_season_profile`, migration
`20261027100100_football_player_season_profile.sql`, file only, not applied) and
its service call.

## What must be preserved

- Everything the page shows today: hero, the four key numbers, the next match,
  "Dernières journées" (bars, provisional hatching, screen-reader sentences),
  "Prochains matchs", follow, share, "Comparer" and "Recruter".
- The Comparer / Recruter bar and the clearance above it.
- Every Fantasy rule, the scoring and the gameweek lifecycle. The new section
  only reads football data; it changes no Fantasy figure and feeds none.
- The existing RPCs and their grants. The migration adds one function and
  changes nothing that exists.
- The page still renders when the new read fails: the new section carries its
  own loading, empty and error states.

## Improvements

1. A football section after "Dernières journées": this season's matches
   played, starts, minutes, goals, assists, yellow and red cards and the
   average rating, then the last five matches (opponent, home or away, score,
   minutes, rating), each row linking to the match page.
2. Honest coverage. The post-match pipeline has not yet written figures for
   every finished match, so the RPC returns how many of the club's finished
   matches the figures cover, and the page says so ("Sur 4 des 5 matchs de son
   club"). Complete coverage shows no note. Partial figures are never presented
   as the full season.
3. The average rating is the mean of the matches that carry a rating, and the
   screen says over how many; a player with no rated match shows a dash.
4. Data comes from `app.player_fixture_performances` (active rows only) and
   the fixtures table, not from match events, whose goals do not always carry a
   player.
5. NOT built: the mock-up's "Prochain match" and Fantasy blocks (the page
   already has both), the "source SofaScore" credit (the provider is not part
   of the read) and any sponsor slot.

## Acceptance criteria

- Visual: at 360 px in French and Arabic (right-to-left) and at 1280 px, the
  section reads in the page's own card style, with no horizontal overflow at 320
  and 360 px (measured on element boxes), numbers in `<bdi>`, text 12 px or
  larger, last-match rows at least 44 px tall.
- Loading shows a skeleton, no match this season shows "Pas encore de match
  cette saison", a failed read shows an error with a retry and leaves the rest of
  the page untouched.
- Partial coverage shows the "Sur X des Y matchs" note; complete coverage shows
  none.
- Functional: typecheck, lint, the i18n key-parity test, the migration check and
  the new pgTAP test pass (pgTAP where Docker is available; CI's
  `database-quality` is the authority). No figure is invented: every number is
  read from the RPC.
