# GW1 recovery: skip what cannot change anyone's points (roadmap step 4)

**Status: applied to production on 2026-10-04 (with 20261004130000, the raised limits); GW1 and
GW2 imported and finalized with it. Production record:
[APPLIED_2026_10_04_GW1_LEFT_OUT_PLAYERS.md](../production/APPLIED_2026_10_04_GW1_LEFT_OUT_PLAYERS.md).**

## The owner's decision (2026-10-03)

> "It's okay if we miss some data as long as it won't hurt the scoring … if there
> is something that can be skipped skip it, if it hurts the scoring directly no."

GW2 carries over: every team's GW1 lineup is scored again for GW2 (a separate,
later step).

## Where GW1 stands (production, read-only, 2026-10-04)

GW1 is `provisional`. 19874705 and 19874708 are imported. Five are not:

| Fixture  | What stops it today                                                                                                                                                           | What the new rule does                                                                                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 19874706 | Player statistics credit 4 goals to a side that scored 3; the match events list exactly 3.                                                                                    | The events decide who scored (goal statistic of one player corrected). Then any lineup players nobody holds are left out.                                                                                                                             |
| 19874707 | 11 lineup players the catalogue cannot place (one has no position at all).                                                                                                    | Left out: none is held.                                                                                                                                                                                                                               |
| 19874709 | Statistics credit 2 goals to a side that scored 3; the events list 3. 12 unplaced players. One held midfielder (Yassine Belfada) has no provider link.                        | Events decide the goals. Unplaced players left out. Belfada is not on his club's team sheet for this match, so he did not play: **owner confirmation needed** before the database accepts that.                                                       |
| 19874710 | A forward's goals conceded cannot be proved. 10 unplaced players. The held goalkeeper Anas Zniti is listed at RSB Berkane but played the whole match in goal for CODM Meknès. | The forward takes his side's total (forwards score nothing for it). Unplaced players left out. Zniti: **owner decision needed** to score his row at CODM; otherwise the database refuses, because leaving him out would cost his manager real points. |
| 19874711 | 12 unplaced players (one has no position).                                                                                                                                    | Left out: none is held.                                                                                                                                                                                                                               |

Held = in a locked GW1 lineup (starters and bench). Checked read-only: apart from
Belfada and Zniti, every held player at these clubs has a provider link and a club
record. The other session's count missed Zniti because he is filed under Berkane.

Not yet known, because only the provider payload shows it: whether any of the five
has unnamed lineup rows (no provider player id). An unnamed starter makes every
held player of that club who has no row "participation unknown", which blocks
finalization. The read-only diagnose run will show it.

## What changed

### Database: `20261004120000_current_fixture_left_out_players.sql`

- `api.ingest_current_player_fixture_performance` gets a new front. Without
  `leaveOutUnplacedUnheld` in the coverage, or for a fixture under adaptive scoring,
  or when there is nobody to leave out and nobody to place, it calls the existing
  import unchanged (renamed `_v2`).
- With it, a lineup row whose provider id has no mapping, or whose player has no
  club record at that club on match day, is **left out** and recorded in
  `app_private.current_fixture_left_out_players` (provider id, club, reason,
  minutes, goals, own goals), bound to the coverage version. It is counted as
  "excluded by mapping", never as an unnamed starter.
- The database **refuses** (nothing written) when leaving out could change points:
  - `LEAVE_OUT_GAMEWEEK_NOT_LOCKED`: a gameweek the match counts for is not locked,
    live or provisional, or has an unlocked lineup;
  - `LEFT_OUT_PLAYER_HELD`: a left-out row is a player some team holds;
  - `HELD_PLAYER_UNMAPPED`: a held player at either club has no provider link, so he
    could be one of the left-out rows (unless the owner confirmed him absent);
  - `LEFT_OUT_ROWS_EXCEEDED`: more than 20 rows left out in all, or fewer than 22 kept.
- Owner decisions, each re-checked (`OWNER_DECISION_STALE` when the world changed):
  `heldPlayersNotInSquad` (Belfada) and `placeAtFixtureClub` (Zniti).
- `defensiveUnknownForwards`: refused unless each is a canonical forward whom no
  Fantasy player lists at another position (`DEFENSIVE_UNKNOWN_NOT_FORWARD`).
- Who is left out is part of the coverage version, so a later import of the same
  provider facts, after those players are placed, never inherits the old record.
- Scoring: the fixture check accepts "excluded by mapping" equal to the recorded
  left-out rows; the goal check now also counts goals of players outside the Fantasy
  catalogue and of left-out players (it used to count catalogue players only, so a
  goal by anyone else made the match look short).

### Importer: `scripts/backend/current-season-performances.ts`

- Asks for the rule on every non-adaptive fixture, and sends the approved owner
  decisions for that fixture from `scripts/backend/current-fixture-owner-decisions.json`
  (both entries are `proposed` until the owner approves them).
- When the per-player goal statistics disagree with the final score but the
  provider's goal events add up to it on both sides, the events decide who scored.
  Not with an own goal event, nor when an event names someone outside that side's
  lineup.
- A starter with 60–89 minutes whose goals conceded cannot be proved no longer stops
  the match when the provider lists him as an attacker: he takes the side's total and
  no clean sheet, and the database checks he is a forward.
- Accepts `active = rows − leftOut` from the database and reports both.

The earlier one-substitute exception (`20261001130000`, only on a draft branch, never applied)
is removed: the general rule covers both no-position substitutes.

## Evidence

- Database tests: `supabase/tests/database/current_fixture_left_out_players.test.sql`,
  33 checks, all pass locally. Full local suite: 3878 checks, 8 failures, the same 8
  with this migration removed (scheduler, alert e-mail and storage tests that need
  services the local database does not have). CI's `database-quality` job is the
  authority.
- Breaking each rule on purpose makes the tests fail: the held check, the unmapped
  held check, the version binding, the goal count, the fixture-check equality and
  the lock check (database); the goal events, the forward-only condition, the own-goal
  stop and the left-out count (importer).
- Importer tests: 82 + 9 pass.
- Staging (`srdrflfrfpwixsllveid`, 2026-10-04): migration applied (recorded there as
  `20261004050738`, the tool's own timestamp). The same 33 checks run against staging
  in one transaction ended by a deliberate error: `{"ran": 33, "failed": 0}`. Afterwards
  no test row remained (left-out table empty, no test mappings, competition or user).
  Staging has no real GW1 data, so this proves the rule, not the five real fixtures:
  that is what the read-only diagnose run in production is for.

## What the owner needs to approve for production, in order

1. **Belfada** (709): he is not on the team sheet, so he did not play. Approve?
2. **Zniti** (710): score his match at CODM, where he played (his Fantasy club stays
   Berkane). Approve?
3. Merge this work to `main` (the import workflow runs `main` only).
4. Apply the migration to production through the reviewed migration path.
5. Pause the live refresh while importing (one writer per database).
6. Run the read-only **diagnose** for the five fixtures (shows unnamed rows and
   exactly who would be left out), then **ingest** one fixture, check it, then the
   other four.
7. Run the manual Fantasy worker for GW1; it finalizes once all seven fixtures are in
   and no held player's participation is unknown.

## Raised limits (20261004130000, owner decision 2026-10-04)

The first production pass stopped at 19874709 (Wydad Casablanca vs Widad Témara; the
migration's comment calls it "MAS vs Zemamra" by mistake): none of Widad Témara's 19 lineup
players is placeable and 7 of Wydad's 20 are not either, so 26
rows would be left out and 13 kept, past the rule's limits (20 left out in all, 22
kept). Nobody's points depend on them: the only held Widad Témara player is
the owner-confirmed absent one, and every held Wydad player is mapped.

The limits are now: up to 40 named rows left out, counted apart from the
unnamed rows (which keep their own bound of 20); at least 11 rows kept, and kept
plus left out at least 22. The coverage table's two checks, the scoring
document's fixture check and the import's own check are changed to match; the
two functions are patched in place, and the migration stops unless each patch
lands exactly once. Every check on held players is unchanged.

Guarded production script: `scripts/backend/apply-20261004130000-current-fixture-left-out-limit.sql`.
