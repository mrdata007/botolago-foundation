# Fantasy reviewed correction from Sofascore

Owner decision, 2026-10-10: finished matches whose SportsMonks statistics never
arrived are filled in from Sofascore and recorded as a **reviewed correction**,
so the gameweek can be scored. Flashscore is not used.

First use: GW3 fixtures 19893370–19893373 (alerts #385 and #363).

## What is recorded

The eight facts simple scoring needs, per player who appeared: minutes, goals,
own goals, goals conceded while on the pitch, clean sheet (60+ minutes and none
conceded), yellow card, red card, second-yellow dismissal. They come from
Sofascore's lineups (minutes when given) and match events (goals, cards,
substitutions). Assists, saves and penalties are not recorded, so the match is
scored in **simple** mode, which already leaves those out.

It goes through `api.service_record_fantasy_observation(…, 'reviewed-correction')`.
Every guard of that function applies: final score, 11 starters a side, club
membership at kickoff, consistent statistics, the expected previous digest, and
a reviewer and reason. A reviewed correction wins over any later SportsMonks
observation for the same fixture.

## Who is who

A Sofascore player is one of ours only through an active Sofascore mapping
(**linked**), or as a **SUGGESTED** match: same club, same shirt number at
kickoff and a compatible position, among our players with no Sofascore mapping
yet. Never by name. Suggested rows are confirmed by the owner when approving.

Blocked (not recordable) when: a substitute who played, or a starter who scored
or was booked, has no player of ours; more than 4 starters are unplaced; the
goals do not add up to our final score; the fixture is not final; the gameweek
is already finalizing.

## Steps (owner)

1. GitHub → Actions → **Fantasy reviewed correction (Sofascore)** → Run on
   `main`: `confirmation` `PREPARE_REVIEWED_CORRECTION`. Read-only: 3 Sofascore
   requests per match, and production reads. It opens an issue with one table
   per match and the proposal files.
2. Claude commits the proposal files under
   `docs/production/reviewed-corrections/gw3/` in a pull request. Check the
   tables (SUGGESTED rows, minutes, goals), then merge to approve.
3. Run the workflow with `DRY_RUN_REVIEWED_CORRECTION`: every guard runs and
   everything is rolled back. Each fixture must report `dry run OK simpleReady=true`.
4. Run it with `RECORD_REVIEWED_CORRECTION`: it dry-runs all of them again,
   writes only if all pass, then reads each back.
5. The next Fantasy orchestrator pass scores the gameweek; the alerts close
   themselves on their next green run.

Retrying is safe: the same facts are stored once (same digest).
