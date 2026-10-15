# BotolaGO+ Trophées operations runbook

Migrations `20261015150000` to `20261015150200`, installed by
`scripts/backend/apply-20261015150000-trophies.sql` (built by
`scripts/backend/build-apply-trophies.ts`). The brief is
`docs/product/botolago-plus-trophies-brief.md`; this file is what the owner and
on-call do with the database part.

## What it is, in one paragraph

A trophy is a milestone a manager earns by playing Fantasy: a first published
rating, a first passage into a tier, a journée at 80 points, ten or thirty
journées played, a transfer that paid off, a place on the podium of a private
league, the founding cohort. **Trophées are earned by everyone, by playing.**
BotolaGO+ changes only the presentation: the lit cabinet, the frames drawn on
the Manager Card and the 9:16 story card. Nothing is sold, and nothing here
changes a score, a rating, a tier or a rank. **A trophy is never taken back**:
once earned it stays, including after a corrected result.

The word is « trophée » (French) and « كأس / كؤوس » (Arabic). It is not the admin
prize system (`app.fantasy_prizes`), which this feature never reads or writes.

## What ships, and that it ships off

- `app_private.trophy_settings`: one row, `enabled = false`. While off,
  `trophies-tick` answers `{"status": "off"}` and writes nothing.
- While BotolaGO+ is off (or the Manager Card reads are off) every read answers
  `{"available": false}`; in `preview` only members see anything.
- `app.trophy_catalog`: twelve trophies in five families (rules version 1).
- `app.card_frames`: `standard` and eight frames, each rewarding the trophy of
  the same code.
- Two pg_cron jobs: `trophies-tick` (minutes 10 and 40) and
  `trophies-history-prune` (daily 03:31 UTC; it deletes only this tick's
  `cron.job_run_details` rows older than 7 days).

## The rules (version 1)

Over final results only (the Manager Card's own "evaluable gameweek": finalized
or corrected, points final, post-work complete). Thresholds live in
`app.trophy_catalog.need`, so the screens and the rule cannot drift.

| Code                                                         | Family    | Rule                                                                       |
| ------------------------------------------------------------ | --------- | -------------------------------------------------------------------------- |
| `first_rating`                                               | paliers   | the first week the card shows a rating                                     |
| `first_stade`, `first_pro`, `first_champion`, `first_legend` | paliers   | the first week the card shows that tier or a higher one                    |
| `gw_80`                                                      | journees  | the first journée with a final score of at least 80                        |
| `ten_gameweeks`, `thirty_gameweeks`                          | journees  | the 10th (30th) played and published journée of the season                 |
| `winning_transfer`                                           | decisions | the first counted transfer (the card's TRF gain) worth at least +10        |
| `league_podium`, `league_leader`                             | ligue     | first three (first) of a private league that ranks at least three managers |
| `founder_2026`                                               | carte     | the manager holds the founding-cohort mark (earned once, ever)             |

`source_published_at` is the `finalized_at` of the gameweek that completed the
rule (for a transfer: the last gameweek of the window that counted it). A rule
whose source has no stamp is not granted yet; the next pass tries again.

A new rule is a new catalogue row and a new evaluator migration, never an edit
of an applied one. Retiring a trophy sets its `status` to `retired`: nobody
loses what they earned (the reads still serve it), it is just no longer granted.

## Never taken back

`app.trophies_earned` refuses every `update` and every statement that deletes a
row (two triggers). The cascades of an erased account, a removed Fantasy season
or a removed catalogue entry still pass. There is no `withdrawn` state, and no
code path in this feature deletes a trophy. Do not add one: the owner decided,
2026-10-15, that a corrected result never removes a trophy.

## The pending trophy

`api.get_my_trophies` can list one pending entry, the league podium, when the
manager plays in a private league of at least three, has not earned the podium
this season, and would stand in the first three on the scores that exist today
for a journée whose ratings are not all published. It is shown as « en attente »
and never counts as a trophy until the rule is true over final results.

## Switching it on (owner)

1. Staging first. Rehearse and apply the script (its header says how).
2. `select app_private.trophy_configure(true);` The next pass (minute 10 or 40)
   backfills the current season for everyone. Read the result:
   `select last_run_at, last_result from app_private.trophy_settings;`
   (`{status, season, users, granted, errors}`). `errors` should be 0.
3. Check a manager you know: their cabinet should match their journées.
4. Only then switch BotolaGO+ to `preview` or `on` (PREMIUM_OPERATIONS_RUNBOOK).

Statuses of a pass: `off` (switch), `busy` (another pass holds the advisory
lock), `no_rules` (no usable Manager Card ruleset), `no_season`, `ok`.

Only the current Fantasy season is evaluated. Past seasons are not backfilled
by the pass; a one-off script can call
`app_private.trophies_evaluate_user(user, season)` for them (one writer at a
time, AGENTS.md).

## Scale

Every pass evaluates every active team of the season (the league arithmetic
reads each league mate's weeks). It runs under a ten-minute statement timeout.
If a pass ever approaches it, the answer is an incremental watermark (evaluate
only managers whose results changed since `last_run_at`), not a longer timeout.

## Stopping and pausing

`select app_private.trophy_configure(false);` stops granting. It does not undo
anything and does not stop a pass already running (wait for it). Frames and the
cabinet keep working: they only read.

## Frames

A frame is cosmetic, public where the card is drawn, standard when the
membership ends (the choice is remembered), and in preview only its owner sees it.
`api.choose_card_frame` needs the membership now AND the trophy earned
(`PT403 premium_required` / `PT403 trophy_not_earned`); `standard` is always
allowed. `api.get_trophy_card_frames(uuid[])` serves up to 100 teams' frames.

## Display only

Only these functions name the new tables, and `trophies.test.sql` fails if the
list changes: the three reads, `card_frame_effective`, the evaluator and its
helpers. No ranking, league, Fantasy, Pronostics, Pépites or Manager Card
calculation reads a trophy or a frame. `app_private.trophy_access` is the one
new function that names the membership functions; `card_editions.test.sql`
lists it.
