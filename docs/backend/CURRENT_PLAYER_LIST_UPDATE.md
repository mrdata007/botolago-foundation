# This season's player list, corrected from SportsMonks

Migration `20260925200000_current_player_list_update`. Owner decision,
2026-09-25.

## Why

The 2026/27 player list was carried over from 2025/26 on 17 September
([FANTASY_2026_27_BRIDGE_ACTIVATION.md](FANTASY_2026_27_BRIDGE_ACTIVATION.md),
step 3), because SportsMonks had no squads yet for the two promoted clubs.
Summer transfers are not in it, and Amal Tiznit's and Widad Témara's squads
were typed in by hand without SportsMonks ids. The squad import that would
correct it refuses once the Fantasy catalog is staged
(`fantasy_catalog_already_staged`), by design.

It matters beyond the squad pages. A match's statistics are imported only if
every named player is listed at the club they played for
(`PLAYER_MEMBERSHIP_NOT_FOUND`, `PLAYER_MAPPING_NOT_FOUND`). Fantasy credits a
player only with their listed club's matches. On the first match of the
season, 18 of the 28 players SportsMonks named could not be placed
([APPLIED_2026_09_25_CURRENT_PERFORMANCE_ABSENT_AS_ZERO.md](../production/APPLIED_2026_09_25_CURRENT_PERFORMANCE_ABSENT_AS_ZERO.md)).

## The rules

Only positive evidence changes anything:

- A player is placed at the club of their latest lineup among the fixtures
  observed. Otherwise they go to the one club whose squad lists them.
- A player in two squads and no lineup is left alone.
- A player SportsMonks does not show anywhere stays where they are. Nobody is
  removed from the list or the game.

For each player placed at a club:

| The player                                         | What happens                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Listed at that club                                | Nothing                                                                                                    |
| Listed at another club                             | Moves: their other club records for this season are removed (kept in the result), the new one opens        |
| Known but with no club this season                 | Joins the club                                                                                             |
| Unknown, but typed in by hand at that club by name | Gets their SportsMonks id                                                                                  |
| Unknown, and matched to no one                     | Created, as the squad import creates players, and joins the club (a player without a position is left out) |

Some players stay as they are:

- A player with two hand-typed namesakes at the club.
- A player with no position anywhere.
- A player with this season's statistics for another club: that is a move
  during the season, not a summer transfer, and a person dates it.

A move removes the player's other club records for this season rather than
closing them, because the statistics import checks a club by its dates, not
by `active`. This season's moves are summer transfers, so the player never
belonged to the old club this season.

Only SportsMonks' own full name is matched, against the full name typed in by
hand: equal without accents and case, at least two words long, at the same
club, one to one. A display name, a surname, or a name already in the list
(which may have been filled in from a display name) never matches. A player
SportsMonks gives no full name is matched to no one; if new, they are created
under their display name, as the squad import does.

Fantasy follows the list:

- A player who moves scores for their new club from now on. Squads keep them,
  and their price does not change.
- A player new to the game is priced exactly as the opening catalog was
  (`app_private.fantasy_initial_price_v1`, from their latest completed Botola
  season's rating, or the neutral 6.0). Their price history starts with
  `player_list_addition_v1`.
- A linked player who also sits at the club under a hand-typed record is a
  duplicate. The hand-typed record leaves the list and the game (`active` and
  `eligible` false). This happens only if nobody has held, traded or scored
  with it, the same test as
  [`fantasy-deactivate-duplicate-player.sql`](../../scripts/backend/fantasy-deactivate-duplicate-player.sql).
  Otherwise it stays and is listed in the plan's `usedDuplicates` for the
  owner.
- The update refuses if it would leave any Fantasy squad over the club limit
  (`fantasy_club_limit_exceeded`), before and after it writes. Transfers and
  new teams take a shared lock before they check the club limit, which the
  update takes exclusively, so they and the update wait for each other and
  never check against a club being changed.

## How to run it

1. **Observe.** GitHub -> Actions -> "Observe current Football player list",
   on `main`:
   - `expected_commit`: `main`'s commit;
   - `confirmation`: `OBSERVE_CURRENT_PLAYER_LIST`;
   - `fixture_ids`: the finished fixtures whose statistics must import, for
     example `19874708`.

   It reads every club's squad and those lineups from SportsMonks and records
   them in production (`api.service_record_current_player_list`, one row in
   `app_private.current_player_list_observations`). It changes nothing else.
   It stops, recording nothing, if SportsMonks returns one player's details
   under another player's id (`included_player_mismatch`).
   Recording holds every scheduled (pg_cron) job off until it finishes, and
   refuses while one is mid-run; the run then waits and tries again, six
   times, 10 seconds apart.
   Its evidence, `current-player-list.json`, holds the plan
   (`api.service_plan_current_player_list`): every change, what was skipped
   and why, and a digest of the changes.

2. **Review the plan.** Check the moves, additions and retirements it lists.
   `report.unobservedByClub` counts the players SportsMonks shows nowhere, and
   `report.handTypedUnmatched` lists the hand-typed players still matched to no
   one. Both are left as they are.
3. **Apply it** within 24 hours, with the Fantasy tick paused, using
   [`apply-current-player-list.sql`](../../scripts/backend/apply-current-player-list.sql)
   (rehearsal first). The apply stops if any of these hold:
   - the plan's digest has changed since it was reviewed;
   - the tick is on;
   - a scheduled (pg_cron) job is mid-run (the others are held off until the
     apply ends);
   - a gameweek is being finalized;
   - the observation was already applied;
   - a squad would go over the club limit.

   Once applied, it plans the same observation again and refuses unless
   nothing is left to change. The plan and the result are kept in
   `app_private.current_player_list_updates`.

4. Import the statistics of the fixtures observed.

Before the first run, the migration itself goes on production with
[`apply-20260925200000-current-player-list-update.sql`](../../scripts/backend/apply-20260925200000-current-player-list-update.sql).

## Undo

Every applied change is kept in `app_private.current_player_list_updates.plan`
with what it replaced (`fromClubIds`, `fromFantasyClubId`,
`duplicatePlayerId`, and the result's `removedMemberships`), so each can be
reversed by hand:

- put back a removed club record (the result's `removedMemberships` holds each
  row whole) and remove the new one;
- restore the Fantasy club;
- delete a new mapping;
- set a retired duplicate `active` and `eligible` again, and put back its club
  record.
