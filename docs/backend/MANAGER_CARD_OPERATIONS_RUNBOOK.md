# Manager Card operations runbook

BG-0158. Migrations `20261008123000` to `20261008123400`, then
`20261010120000` to `20261010120300` (the read API the Gradins screens use,
see `MANAGER_CARD_GAP_PLAN.md`). The design and the
owner's decisions are in `MANAGER_CARD_DOMAIN_PLAN.md`; this file is what the
owner and on-call do with it. The card is each manager's football identity,
built from their Fantasy play: an overall rating (OVR), a tier, four stats
(CAP, SEL, TRF, CON), a permanent number (`BOT #004821`) and an optional
FOUNDER mark.

## The one rule: the card is display only

OVR, tier, stats, number and founder mark are shown to signed-in users and
nothing else. **No prize, ranking, league or Fantasy rule may read card data.**
The card reads Fantasy tables and never writes one. A database test asserts
that no function outside the card's own reads `app.manager_card*`. If a change
asks a prize or a league to look at a card, stop: it is not allowed.

## What ships, and that it ships off

Applying the migrations (through the guarded scripts, see "Production order")
creates tables, functions and two scheduled jobs. They switch nothing on and
insert no rules:

- both switches are `false` (`app_private.manager_card_settings`, one row);
- there is no rules row (`app_private.manager_card_rules` is empty);
- the reads answer `{"available": false}`, not an error, and
  `api.manager_card_status()` answers `{"enabled": false, ...}` (anyone can call
  it, signed in or not). The section stays hidden;
- the acknowledgement call answers that everything is ignored and writes
  nothing;
- `manager-card-tick` runs every 15 minutes and answers `{"outcome":"off"}`
  without writing anything, the job log included;
- the account erasure now also waits for the card's lock (see "Account
  deletion").

## The two switches

One row in `app_private.manager_card_settings`, changed only by
`app_private.manager_card_configure(p_compute, p_read)`, which only the
`postgres` role can run. **`null` leaves that switch as it is.**

| Switch    | What it lets happen                                                                  |
| --------- | ------------------------------------------------------------------------------------ |
| `compute` | The tick may calculate and write cards. It still needs an active rules row.          |
| `read`    | The status, the three reads and the acknowledgement answer for real instead of "off" |

```sql
select app_private.manager_card_configure(true, null);   -- compute on, read untouched
select app_private.manager_card_configure(null, true);   -- read on, compute untouched
select app_private.manager_card_configure(false, null);  -- compute off, read untouched
select app_private.manager_card_configure(false, false); -- both off
```

The read switch alone is not enough: the section is "ready" only when reads are
on **and** one active rules row has usable numbers (a minimum of at least 1,
four rising tier cut-offs between 1 and 99). Until then everything answers off,
so a bad rules row hides the section instead of breaking it.

Each call answers `{"computeEnabled": ..., "readEnabled": ...}`. Switch compute
on first and let the first evaluation finish and be checked; switch read on only
after that, so nobody sees an empty card.

## The owner's three scripts, in order

After the card is installed (switched off, no rules row), three scripts in
`scripts/backend/` take it to launch. You paste each into the Supabase SQL
Editor; none of them switches anything on. Run them in this order, one at a
time:

1. **Calibrate:** `manager-card-calibration-dry-run.sql`. It runs the card's
   real calculation over every finished gameweek, then ends with an error on
   purpose, so **nothing is saved**. The error text after `calibration result:`
   is the result: counts and percentiles only, no names, plus a proposed
   ruleset (`proposedRulesV1`) and a list of warnings (too few gameweeks or
   teams, no CAP start date yet). Paste that line back; the numbers are
   reviewed before anything is installed.
2. **Rules v1:** `apply-manager-card-rules-v1.sql`. A template: the reviewed
   JSON replaces the marker inside it, and it refuses to run while the marker
   is there. It is a rehearsal first (`rollback;`); change that line to
   `commit;` to install version 1. Compute stays off.
3. **Founder grant:** `manager-card-founder-grant.sql`. Run it on or after
   1 November 2026, once. It refuses before the 31 October cut-off has passed
   (end of day, Moroccan time) and refuses if founders already exist. Its
   rehearsal ends with `founder dry run: N managers would be founders`; the real
   section is commented out and needs N typed in, so it cannot mark a different
   number than you saw.

Then switch compute on (see "Production order"). Each script says at the top
what it does and how to run it.

## The app's switch

The Gradins section has a second switch, in the website code:
`MANAGER_CARD_ENABLED` in `src/lib/feature-flags.ts`. It is `false` today. It
can go to `true` before or after the read switch, because the section shows
only when both agree. **The read switch is the launch.** The website asks
`api.manager_card_status()` on the server and keeps the answer for about a
minute (`src/services/manager-card-status-server.ts`). So:

- switching reads on shows Gradins within about a minute, with no republish;
- switching reads off hides it within about a minute, with no republish.

Changing `MANAGER_CARD_ENABLED` itself needs a Lovable publish.

## Rules v1

Nothing is calculated until an **active** row exists in
`app_private.manager_card_rules`. A row is `(version, config jsonb, active)`.
At most one row is active (a partial unique index enforces it).

### Calibration comes first, and it needs real numbers

The four scales and the tier cut-offs must come from real 2026/27 results, then
be frozen. **Never invent them, and never copy the placeholder numbers in tests
or in the plan.** Calibration needs an **owner-granted, aggregate-only read of
production**: the owner says in writing that it may be done, and it returns
only counts and percentiles, never a row that names a user or a team. What to
ask for:

- the number of teams and the spread of finished weeks per team;
- for each of the four raw figures (CAP, SEL, TRF, CON), the percentiles
  (1, 5, 10, 25, 50, 75, 90, 95, 99) over teams with at least the minimum weeks;
- the same for OVR once the scales are drafted, to place the tier cut-offs
  (aim: LEGEND top 1%, CHAMPION next 4%, PRO next 15%, STADE next 30%, HOMA the
  rest);
- how many teams have no transfer at all (their TRF is a dash, not 0).

Keep the output with the task evidence. The authorisation covers that read and
not the next one.

### The `config` shape

```json
{
  "minimum_gameweeks": 3,
  "provisional_below": 5,
  "trf_window_gameweeks": 3,
  "cap_ignore_deadlines_before": "<date PR #376 ships, ISO 8601 with Z>",
  "scales": {
    "cap": [
      [0, 1],
      [1, 99]
    ],
    "sel": [
      [0, 1],
      [1, 99]
    ],
    "trf": [
      [-10, 1],
      [10, 99]
    ],
    "con": [
      [0, 1],
      [1, 99]
    ]
  },
  "tiers": { "stade": 50, "pro": 65, "champion": 78, "legend": 88 },
  "batch_size": 500
}
```

The numbers above are **shape only**. Replace every one from calibration.

| Key                           | What it means                                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `minimum_gameweeks`           | Finished weeks a team needs before it has a card. Under it, OVR, tier and stats are all empty. The app also uses it to show last season's figures, with their label, until the new season reaches it.                                                   |
| `provisional_below`           | From the minimum up to this many weeks, the card is marked provisional.                                                                                                                                                                                 |
| `trf_window_gameweeks`        | How many gameweeks after a transfer are used to judge it (the new player's points minus the sold player's). At least 1.                                                                                                                                 |
| `cap_ignore_deadlines_before` | CAP skips weeks whose deadline is before this moment. Set it to when PR #376 reached production: before it, a manager who never picked a captain got the goalkeeper by default. See below. Optional in the code, but the owner decided to set it (D12). |
| `scales`                      | For each stat, points `[raw, score]` sorted by raw. The raw figure is mapped by straight lines between points, clamped outside the first and last point, rounded and kept between 1 and 99. At least two points each. CAP, SEL and CON raw run 0 to 1.  |
| `tiers`                       | The lowest OVR of each tier. Below `stade` is HOMA. Keep them rising: stade < pro < champion < legend.                                                                                                                                                  |
| `batch_size`                  | Once one tick has evaluated this many teams, it starts no further gameweek. A gameweek is never split, so the first one in a tick always runs whole.                                                                                                    |

A rules row with a missing or mistyped key does not break production: the tick
catches the error, writes an `error` row to the job log and carries on. But
check the JSON before you insert it.

### Inserting it

A rules row is **immutable once inserted** (a trigger refuses to change
`config` or `version`), and every evaluation is filed under the rules version
it used. So a change of formula is **a new version, never an edit**. The first
row:

```sql
insert into app_private.manager_card_rules (version, config, active)
values (1, '{ ...the calibrated config... }'::jsonb, true);
```

Later, to replace it (one transaction; the old version must go inactive first):

```sql
begin;
update app_private.manager_card_rules set active = false where active;
insert into app_private.manager_card_rules (version, config, active)
values (2, '{ ... }'::jsonb, true);
commit;
```

A new active version has no evaluations, so the next tick re-evaluates **every**
finished gameweek from the start, in order, a few per tick (see "Load"). Cards
move to the new figures as it catches up. Do not switch versions in the middle
of a gameweek's scoring.

### `cap_ignore_deadlines_before` and PR #376

PR #376 fixes the default captain. Until it is on production, weeks have a
captain nobody chose for managers who did nothing, which makes CAP noisy. Set
`cap_ignore_deadlines_before` in version 1 to **the date and time PR #376
shipped to production** (the Lovable publish, not the merge). If #376 has not
shipped when rules v1 is ready, wait or ship v1 without it and plan a v2; do not
guess a date.

## Rules v2 (calm scores)

Owner decision 2026-10-12. After two finished weeks a card swung by tens of
points, and Selection credited the points the automatic substitutions earned.
Rules v2 changes the **calculation only** (no Fantasy point, rule or lineup):

| Key / scale         | v1                   | v2                                                      |
| ------------------- | -------------------- | ------------------------------------------------------- |
| `provisional_below` | 2                    | 5 (provisional until 5 finished weeks; minimum stays 2) |
| `scales.sel`        | `[[0.5,1],[1,99]]`   | `[[0.5,1],[0.8,50],[1,99]]`                             |
| `shrinkage`         | absent (none)        | `{"cap": 4, "sel": 4, "con": 4, "trf": 4}`              |
| `sel_numerator`     | absent (substituted) | `"picked_starters"`                                     |

Everything else (minimum, window, batch size, tiers, CAP start date, the other
three scales) is v1's. The two new keys are optional in the code: **a rules row
without them behaves exactly as before**, so v1 keeps producing today's numbers
until v2 is activated.

**Shrinkage.** After a stat is mapped onto 1 to 99 with its scale it is pulled
toward 50 by the number of samples n it rests on:

```
shrunk = round(50 + (scaled - 50) * n / (n + k))      kept in 1..99
```

k is `shrinkage.<stat>` (k = 0 or the key absent means no pull). n is, per team:
CAP the weeks with a CAP ratio (not skipped), SEL the weeks with a SEL ratio
(not Bench Boost, best eleven above 0), CON the weeks counted, TRF the
**transfers** counted (not the batches). Worked example, k = 4:

| samples n | two perfect weeks (scaled 99)          | scaled 1                               |
| --------- | -------------------------------------- | -------------------------------------- |
| 2         | 50 + 49 x 2 / 6 = 66.33, shows **66**  | 50 - 49 x 2 / 6 = 33.67, shows **34**  |
| 8         | 50 + 49 x 8 / 12 = 82.67, shows **83** | 50 - 49 x 8 / 12 = 17.33, shows **17** |
| 30        | 50 + 49 x 30 / 34 = 93.2, shows **93** | 50 - 49 x 30 / 34 = 6.8, shows **7**   |

The pull fades as the season fills. OVR keeps its rule (the rounded mean of the
stats that exist, at least three of four) but over the pulled stats, and the
tier comes from that OVR. The stored raw figures (`cap_raw` and the others) stay
the plain averages; the sample counts are internal and no read function changed.

**Selection.** With `sel_numerator` `"picked_starters"` the ratio is the points
of the eleven the manager **picked** (`app.fantasy_lineup_players.slot =
'starter'` of the result's locked lineup, each player's `final_points`, a
starter who did not play contributing his own 0, no captain bonus) over the best
legal eleven of the fifteen, as before. v1's numerator is
`fantasy_team_gameweek_results.starting_points`, which includes what the
automatic substitutions brought on. Bench Boost weeks and a best eleven of 0 or
less are still skipped; the ratio is still kept between 0 and 1. A malformed
`shrinkage` or `sel_numerator` makes the tick log `manager_card_rules_invalid`
for that gameweek (it carries on and writes nothing for it).

### Installing v2

The migration (`20261012170000_manager_card_shrinkage_and_selection.sql`)
replaces the single function `app_private.manager_card_evaluate_gameweek`; the
guarded script `scripts/backend/apply-manager-card-rules-v2-calm.sql` records
and applies it with the exact reviewed bytes and then inserts and activates
rules v2, in one transaction, ending in `rollback;`. It is the owner's call: an
agent does not run it, and the authorisation covers this run and not the next.

1. Merge the pull request once its `database-quality` job has passed.
2. **Pause the card's writers** (AGENTS.md, "One writer at a time"). Read the
   switches first, then:
   ```sql
   select compute_enabled, read_enabled from app_private.manager_card_settings;
   select app_private.manager_card_configure(false, null);
   select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-tick'), active := false);
   ```
   Wait for any `manager-card-tick` run to finish. Leave the read switch alone:
   the cards stay as they were.
3. **Rehearse.** Paste the whole script in the SQL Editor and run it. It checks
   the writers are paused and drained, the function it replaces is the reviewed
   one (md5 of its body), the migration text is the reviewed bytes (sha256),
   exactly one rules row exists (v1, active) and v2 differs from it only in the
   four intended keys, then applies and verifies the new body (md5), the owner,
   `security definer`, the empty `search_path` and the grants, inserts v2
   active, checks every key and that the tick still answers `off` and wrote
   nothing, and rolls back. Confirm independently that
   `schema_migrations` has no `20261012170000` row and that only v1 is active.
4. **Commit.** Change only the last line `rollback;` to `commit;` and run it
   once. Read it back: one `20261012170000` row, two rules rows, v2 the only
   active one.
5. **Resume,** right away and exactly as they were:
   ```sql
   select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-tick'), active := true);
   select app_private.manager_card_configure(true, null);   -- only if compute was on before
   ```
6. **Recalculation.** v2 has no evaluations, so the next tick re-evaluates every
   finished gameweek from the first, in order, up to `batch_size` teams per tick
   (see "Load"); cards, season rows and history move to the v2 figures as it
   catches up (the history keeps `rules_version`). Watch the job log until it
   reports `evaluated` with `morePending: false`, then check a few cards by
   hand against the formulas above. Do this outside match days.

To go back, insert a new version with the v1 numbers (rows are never edited),
activate it the same way (`update ... set active = false where active`, insert,
`commit`), and the next tick recomputes again. The function change itself needs
no rollback: without the new keys it is the old calculation.

## Rules v3 (week one) and the rating-change notification

Owner decisions 2026-10-12: "Everything counts from week 1; every time the
rating goes up or down there's a notification saying your score went up /
went down, and it shows as an animation when the user opens the app and checks
the card." Then: CAP, SEL, TRF and CON each have a number from a manager's
first finished gameweek, and OVR is built from all four.

Migrations `20261012200000_manager_card_ovr_change_type` (the notification
type, alone: an enum value cannot be used in the transaction that adds it) and
`20261012200100_manager_card_week_one`.

| Key                           | v2                        | v3                                      |
| ----------------------------- | ------------------------- | --------------------------------------- |
| `minimum_gameweeks`           | 2                         | 1 (a card is rated from week 1)         |
| `ovr_min_stats`               | absent (3 of 4)           | 1 (OVR from the stats that exist)       |
| `empty_stat_neutral`          | absent (empty stays null) | `true` (a stat with no sample reads 50) |
| `cap_ignore_deadlines_before` | `2026-10-10T12:38:05Z`    | removed (CAP counts every week)         |

Everything else is v2's (provisional below 5 weeks, the scales, the shrinkage
k = 4, Selection on the picked eleven). The two new keys are optional in the
code: **a rules row without them (v1, v2) gives exactly the figures it gave
before** (`supabase/tests/database/manager_card_week_one.test.sql` checks both).

**What week one looks like.** With the shrinkage, a stat with no sample is 50
(that is what the formula gives at n = 0), so `empty_stat_neutral` simply
writes that 50 instead of leaving the stat empty; its raw figure stays null.
Week-one numbers sit near 50 and move as weeks add up, which is the owner's
"calm early scores". A manager after one finished gameweek, with the captain the
squad builder gave him and no transfer, reads for example CAP 53 (his week,
6 of 9), SEL 60, TRF 50 (no transfer judged yet), CON 40 and OVR 51,
provisional. TRF stays 50 until a transfer's three-week window is judged; a
week whose captain did not play (nor the vice) or a Bench Boost week simply has
no sample for that stat. Because every stat now has a number, the cards'
"waiting" reasons (`nullReason`) no longer appear under v3; nothing in the app
breaks when every stat is filled.

**The default captain.** Before PR #376 the squad builder gave a manager who
did nothing an armband (the first starter) and saved it as an ordinary captain:
the database has **no per-week fact** telling a default captain from a chosen
one. v3 therefore drops the cut-off date and counts every week's captain, as the
owner asked; a rule that skipped "only the default captains" would have nothing
reliable to read and is not offered.

**Rating changes.** Each evaluation reads, per manager, the previous evaluated
OVR (the latest earlier history row of the season) and records a change in
`app.manager_card_ovr_changes` when both OVRs exist, they differ, the earlier
row is under the same rules version, and this week's own row is new or already
under it. So:

- the first OVR a card ever gets is not a change (it is the existing
  `first_rating` moment);
- the recalculation a new rules version starts (every history row still under
  the old version) records **no change and sends no notification**;
- a recalculation under the same version (a scoring correction) updates or
  removes the row.

The card read `api.get_my_manager_card` adds one key, `card.ovrChanges`: the
pending change (zero or one): the latest of the current season under the
card's rules, whose new OVR is still the card's OVR, not yet acknowledged.
Shape: `{kind: "ovr_changed", key: "ovr_up:<gameweek id>" | "ovr_down:<gameweek
id>", direction, gameweekSeq, fromOvr, toOvr, delta, fromTier, toTier,
occurredAt}`. The existing `moments` list is unchanged. The app animates it once
and acknowledges the key through `api.ack_manager_card_moments`, which now
accepts the two key shapes, so it never replays, on any device.

**The notification** (`manager_card_ovr_change`, category fantasy):

- one per reader and gameweek (event deduplication key
  `manager_card:ovr_change:<user>:<gameweek>`), only for the season's latest
  finished gameweek (a correction of an older week is not news);
- in the app, plus a push to each working phone when the reader has push on
  (the push claim sends it only while the push switch allows; its life is 12
  hours). No email: the free plan's emails are kept for the moments that need
  them;
- only to readers with notifications, in-app notifications and **Fantasy
  reminders** on (the existing switch for Fantasy messages is the opt-out);
  quiet hours move it, as everywhere else;
- text in French and Arabic, four templates (`manager_card_ovr_up`,
  `manager_card_ovr_down`): « Votre note Curva monte à 72 (+4) 📈 », « Votre
  note Curva descend à 68 (−3) », with a body « Journée N : ouvrez votre carte
  Curva pour voir ce qui a bougé. » A change of wording is a new template
  version, not a deploy. Have a native Arabic reader check the Arabic before
  switching it on;
- a change is considered once: a reader who had reminders off at the time is
  not told later.

**It ships off.** `app_private.manager_card_settings.notify_ovr_changes` is
`false`; changes are still recorded (the animation needs them) but nothing is
created. The owner switches it, with the `postgres` role:

```sql
select notify_ovr_changes from app_private.manager_card_settings;
select app_private.manager_card_notify_configure(true);    -- on
select app_private.manager_card_notify_configure(false);   -- off
```

While it is on, the tick also writes `app_private.notification_events`,
`app.notifications` and `app.notification_deliveries` (AGENTS.md lists it).

### Installing v3

Order (each script is a rehearsal ending in `rollback;`, then `commit;`):

1. `scripts/backend/apply-manager-card-rules-v2-calm.sql`, committed (see
   "Installing v2"); its migration is what v3 builds on.
2. `scripts/backend/apply-20261012200000-manager-card-ovr-change-type.sql`,
   committed. One enum value; nothing reads it yet; no writer needs pausing.
3. `scripts/backend/apply-manager-card-rules-v3-week-one.sql`. It refuses unless
   1 and 2 are saved.

Steps 1 and 3 can be run back to back while the tick is paused, so the tick
recalculates once, under v3. For step 3:

1. Pause the card's writers exactly as for v2 (compute off, `manager-card-tick`
   paused, no run in progress). Push must be off (`select mode from
app_private.notification_push_settings;` reads `off` until the phone app
   exists): the script replaces the push topic and life functions.
2. Rehearse. The script checks the predecessors are saved, each function it
   replaces is byte for byte the reviewed one (md5), nothing it adds exists
   yet, exactly two rules rows (v1 inactive, v2 active) and that v3 differs from
   v2 only in the intended keys; then applies the migration (sha256 of its
   text), checks every new or replaced body (md5), owners, `security definer`,
   empty `search_path`, grants and the closed table, inserts v3 active, checks
   every key, that compute and the notification are still off, that the tick
   answers `off` and that nothing was written; and rolls back. Confirm
   independently: no `20261012200100` row, v2 still the active row.
3. Commit (change only the last line). Read back: one `20261012200100` row,
   three rules rows, v3 the only active one.
4. Resume the tick and compute exactly as they were. The tick recalculates every
   finished gameweek under v3 (no change recorded, no notification).
5. When the owner decides: `select app_private.manager_card_notify_configure(true);`.
   The first notification is for the next finished gameweek.

To go back: insert a new version with the v2 numbers and activate it (rows are
never edited); switch the notification off with
`manager_card_notify_configure(false)`.

## Rules v4 (each week ranked among managers)

Owner decision 2026-10-14 (option A of
`MANAGER_CARD_RATING_POINTS_PROPOSAL.md`). From Fantasy gameweek 5 a player's
points are his SofaScore rating (`FANTASY_RATING_POINTS.md`). Under rules v3
that inflates CAP and SEL (raw point ratios whose floor moved from about 1-2 to
about 6), and the inflation grows all season. Under v4, CAP, SEL and TRF say
**how the manager ranked against the other managers that week** (50 = the
middle manager), whatever the size of the points. The owner accepted that
change of meaning; it replaces the fixed "by meaning" scales of 2026-10-08.

Migration `20261014160000_manager_card_gameweek_percentile` replaces
`app_private.manager_card_evaluate_gameweek` (nothing else). It adds one
optional rules key, `normalize`:

- absent or `"none"`: exactly the figures of v1, v2 and v3 (the pgTAP file
  `manager_card_gameweek_percentile.test.sql` checks it, and
  `manager_card_week_one.test.sql` and `manager_card_calm_scores.test.sql`
  still pass on the new body);
- `"gameweek_percentile"`: before averaging, each weekly figure becomes the
  manager's **mid-rank percentile** in its cohort, `(teams below + (teams level
  - 1. / 2) / (cohort - 1)`, and 0.5 when the cohort is one. Ties share their
       mid-rank (with rating points many captains are the best starter).
  - CAP: among the teams of that gameweek whose CAP week counts (a week with
    no captain who played stays skipped and outside the cohort);
  - SEL: among the teams of that gameweek with a SEL week (Bench Boost weeks
    stay out);
  - TRF: per transfer, among the judged transfers made for the same gameweek
    (they share one window, so one mix of point scales);
  - CON: the top-half figure gets a tie rule: 1 when the team's whole tie
    group is in the top half, 0 when it is wholly in the bottom half, 0.5 when
    it straddles the middle (the middle team of an odd field included). v3
    counted a tie across the middle as top half, which with close rating-point
    totals creeps CON up.
  - anything else is `manager_card_rules_invalid`.

The cohort is the teams the run rates (active teams of the season with a final
result in the gameweek evaluated), the base every stat already used. A past
week's cohort can differ from that week's full field only by teams that have
since left or been deactivated. `cap_raw`, `sel_raw` and `trf_raw` then hold the
average percentile (0 to 1) and `con_raw` the average CON figure. The premium
career read (`api.get_my_card_career`) returns them as `raw`; under v4 they
are percentiles, so its captain `averageShare` and transfer `averageGain` (its
own point-based figures) no longer equal `raw.cap` and `raw.trf`. Nothing on
screen shows `raw` today.

| Key          | v3                          | v4                        |
| ------------ | --------------------------- | ------------------------- |
| `normalize`  | absent                      | `"gameweek_percentile"`   |
| `scales.cap` | `[[0,1],[1,99]]`            | `[[0,1],[0.5,50],[1,99]]` |
| `scales.sel` | `[[0.5,1],[0.8,50],[1,99]]` | `[[0,1],[0.5,50],[1,99]]` |
| `scales.trf` | `[[-10,1],[0,50],[10,99]]`  | `[[0,1],[0.5,50],[1,99]]` |

Everything else is v3's: `scales.con`, the tiers (STADE 50, PRO 65, CHAMPION
80, LEGEND 90), the shrinkage k = 4, minimum 1 week, provisional below 5,
Selection on the picked eleven, OVR from every stat, a stat with no sample
reads 50.

**What does not depend on point sizes any more.** A weekly percentile depends
only on the order of the managers' figures that week. Multiplying every point
(players, team totals, hits) by a constant changes no card (pgTAP checks every
history row). Adding a constant to every player's points changes no TRF gain
and no CON order, and changes no CAP or SEL order between teams whose best
starter and best eleven score the same (pgTAP checks that case too); between
teams whose best differ it can reorder some ratios, but every week's cohort
still averages exactly 0.5, so cards cannot climb as a group. That is the fix:
under v3 the same shift lifts every CAP and SEL ratio. GW1-4 (category points)
and GW5 onward (rating points) are comparable inside one average, and a future
change of scoring needs no recalibration.

**What changes for managers.** Activating v4 recomputes every finished
gameweek **silently** (the history rows are still under v3, so no rating change
is recorded and nothing is notified; the rehearsal below confirms it). In the
simulation of the proposal the mean change at GW4 is -0.2 (95th percentile 2),
and about 5.6% of cards change tier, almost all at the LASTREET/STADE line. From
then on, about as many cards go up as down each week, GW5 included.

**Calibration.** `manager-card-calibration-dry-run.sql` is the pre-v1 tool: it
refuses once any rules row or card exists, so it is not used for v4. Under v4
only the tier cut-offs are left to calibrate (the stat scales follow from their
meaning); placing them at the domain plan's target shares from real data is a
later rules version and the owner's call.

### Installing v4

`scripts/backend/apply-manager-card-rules-v4-percentile.sql` (bun test
`apply-manager-card-rules-v4-percentile-script.test.ts`). It refuses unless v3
is installed (its migrations recorded, its function body byte for byte, exactly
three rules rows with v3 the active one). It applies the migration (sha256 of
its text), checks the new body (md5), owner, `security definer`, empty
`search_path` and that no API role can run it, inserts v4 active (v3 goes
inactive; rows are never edited), checks every key and value, that the switches
are as they were, that the tick answers `off` and that nothing was written to
the card or the notifications, and rolls back as shipped.

**Since GW4's cards are done, compute is off** (the owner's pause, until v4
ships): `select app_private.manager_card_configure(false, null);`. Cards keep
GW4's figures meanwhile; the health check `manager_card` reports warn ("reads on
and compute off"), which does not page.

Order (AGENTS.md, "One writer at a time"). The script writes only the card's
function, its rules table and the migration ledger, and the only writer of
those is the card's own tick, so pausing the card is enough. Choose one of the
two ways below.

**A. The card alone (simplest).**

1. Note the switches:
   `select compute_enabled, read_enabled, notify_ovr_changes from app_private.manager_card_settings;`
   Compute must read `false` (the pause since GW4); if it is `true`, switch it
   off first with `select app_private.manager_card_configure(false, null);`.
2. Pause the tick by name and wait until no run is in progress:
   `select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-tick'), active := false);`
3. Rehearse the script as shipped (it ends in `rollback;`). Read the last row
   ("All checks passed"). Confirm separately that nothing was kept:
   `select count(*) from supabase_migrations.schema_migrations where version = '20261014160000';` (0) and
   `select version, active from app_private.manager_card_rules order by version;` (v3 active).
4. Change only the last line to `commit;` and run it once. Read back: one
   `20261014160000` row, four rules rows, v4 the only active one. A second run
   refuses ("already recorded").
5. Resume: the tick
   `select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-tick'), active := true);`
   then compute `select app_private.manager_card_configure(true, null);`.

**B. With the maintenance pause** (`scripts/backend/sofascore-rating-release-pause.sql`,
on PR #473's branch until it merges, and `sofascore-rating-release-resume.sql`
on `main`), when the owner pauses every background writer anyway. The pause
script refuses unless compute is **on** and every one of the 23 jobs is
active ("maintenance baseline changed"); do not edit it. So:

1. Check that GW5 is not yet evaluable, so that switching compute on for a
   moment can only re-evaluate GW1-4 under v3 (which it already did):
   `select sequence_number, status, points_state from app.fantasy_gameweeks g join app.fantasy_seasons s on s.id = g.fantasy_season_id where s.status = 'active' and g.sequence_number = 5;`
   It must not read `finalized`/`corrected` with `final`. If it does, use way
   A instead: never switch compute on under v3 once GW5 is evaluable (most
   managers would get a misleading "monte").
2. `select app_private.manager_card_configure(true, null);` and right after it
   run the pause script (rehearse, then `commit;`). It switches compute off
   again and pauses every job, `manager-card-tick` included.
3. Run the v4 script as in A.3 and A.4.
4. Run `sofascore-rating-release-resume.sql` (rehearse, then `commit;`). It
   switches compute back on (`manager_card_configure(true, null)`) with the
   other writers and resumes every job.

After either way:

- Watch the job log until the tick reports `evaluated` with
  `morePending: false` and `rulesVersion: 4`
  (`select started_at, outcome, detail from app_private.manager_card_job_log order by id desc limit 5;`).
- Compare the tier counts with the value before:
  `select tier, provisional, count(*) from app.manager_card_seasons group by 1, 2;`
  (owner-authorised aggregate read). A silent shift of about ±1 OVR is
  expected.
- `notify_ovr_changes` is left as it was; nothing is notified for the
  recalculation. If GW5 locked meanwhile, GW5 is evaluated under v4 and its
  change is recorded and notified like any ordinary week.

To go back: insert a v5 with v3's JSON and activate it (rows are never edited).
The function without `normalize` is v3's calculation.

**Local rehearsal (2026-10-14).** On a local database at `main`'s state with
the production v1-v3 rules rows and six seeded managers evaluated under v3 over
three gameweeks: the shipped script passed and kept nothing (no migration row,
v3 active, old body); it refused with compute on, with the tick active and with
a v4 config whose tiers differed from v3; with `commit;` it installed (one
migration row, v4 the only active row, the new body), and a second run refused
("already recorded"). With the tick and compute resumed, one tick recomputed
the three gameweeks under v4 (18 history rows, the figures the pgTAP file
computes by hand), recorded no rating change and created no notification.

## The founder grant

FOUNDER marks the early 2026/27 managers. It is granted **once, by the owner,
after the cut-off**, never later and never automatically. It marks Fantasy teams
of the season created **before the cut-off** that have **at least one finished
week**, for accounts that are not deleted, not staff (`app_private.staff_principals`)
and not `@botolago.com`. A card that already has a founder mark is left alone,
so running it twice cannot change anyone.

The call is `app_private.manager_card_grant_founder(p_fantasy_season_id uuid,
p_cutoff timestamptz, p_cohort smallint, p_excluded_user_ids uuid[])`. It
answers how many cards it marked and gives each one its permanent number as it
goes.

- the **cut-off** is the owner's date; a team created at or after it does not
  qualify;
- the **cohort** is a whole number from 1 (1 for the first cohort);
- the **exclusion array** is the owner's list of extra accounts to leave out
  (test accounts, friends of the house); pass `'{}'::uuid[]` for none. Staff and
  `@botolago.com` accounts are excluded anyway.

Rehearse it first. A `DO` block is one transaction, so ending it with a
deliberate `raise` shows the count and rolls everything back:

```sql
do $$
declare n integer;
begin
  n := app_private.manager_card_grant_founder(
    '<fantasy season id>'::uuid, '<cut-off, e.g. 2026-10-15T00:00:00Z>'::timestamptz,
    1::smallint, '{}'::uuid[]);
  raise exception 'dry run: would grant % founders', n;
end $$;
```

Check that the number is plausible against the count of qualifying teams, check
`select count(*) from app.manager_cards;` is still what it was, then run it for
real by calling `select app_private.manager_card_grant_founder(...)` with the
same arguments. It refuses (`manager_card_busy`) while the tick holds the card
lock; wait for the tick to finish. Run it **once**. It is the owner's call: an
agent does not run it on its own initiative, and the authorisation covers this
run and not the next.

## Pausing and restoring

Before a write that touches Fantasy results, lineups, player points,
gameweeks, teams, transfers, profiles or the card tables (AGENTS.md, "Before
writing"), pause compute and leave the read switch alone:

```sql
select app_private.manager_card_configure(false, null);
-- ...the write...
select app_private.manager_card_configure(true, null);  -- only if it was on before
```

Read what it was first (`select compute_enabled, read_enabled from
app_private.manager_card_settings;`) and restore exactly that. Pausing compute
does not hide cards: they stay as they were until compute is back on.

Signed-in users also write one table, `app.manager_card_moment_acks`: the
moments (new tier, new season and so on) a manager has already seen. They write
it through `api.ack_manager_card_moments`, only their own rows, and only while
the read switch is on. For a write that touches that table, switch reads off for
its length and restore them afterwards. This hides Gradins for that time:

```sql
select app_private.manager_card_configure(null, false);
-- ...the write...
select app_private.manager_card_configure(null, true);  -- only if it was on before
```

The daily prune `manager-card-history-prune` runs whatever the switch says. It
deletes this tick's `cron.job_run_details` rows older than 7 days and
`app_private.manager_card_job_log` rows older than 180 days, and never touches a
card table. Pause it by name for a write that touches those two tables, then
set it back to `true`:

```sql
select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-history-prune'), active := false);
select cron.alter_job((select jobid from cron.job where jobname = 'manager-card-history-prune'), active := true);
```

To stop the tick itself without the switch (rarely needed; the switch is the
normal way): `select cron.alter_job((select jobid from cron.job where jobname =
'manager-card-tick'), active := false);`, and `true` to restore.

## What the tick answers and the job log says

Three answers write nothing and leave no job-log row, so a quiet table is
normal:

| Answer                   | Meaning                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `{"outcome":"busy"}`     | Another run (or the founder grant, or an account erasure) holds the card lock. The next tick tries again. |
| `{"outcome":"off"}`      | Compute is switched off.                                                                                  |
| `{"outcome":"no_rules"}` | Compute is on but no rules row is active.                                                                 |
| `{"outcome":"idle"}`     | Compute is on, rules are active, and nothing is left to evaluate. Also writes no row.                     |

When the tick did work it writes one row to `app_private.manager_card_job_log`.
Its `outcome` is:

| Outcome        | Meaning                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evaluated`    | All stale gameweeks were calculated. Good.                                                                                                                                                                                                                                                                                                               |
| `more_pending` | It stopped at `batch_size` teams with gameweeks still waiting. Normal while catching up; the next tick continues. If it stays that way for many hours after the last gameweek finished, see "Load".                                                                                                                                                      |
| `skipped`      | A gameweek could not be evaluated yet: its scoring version moved during the run (`version_changed`), or it is not evaluable after all. Nothing was written for it; it is retried. Persistent skips mean a correction is in progress or postwork is stuck.                                                                                                |
| `error`        | A gameweek raised an error. The rest of that season is held back (never evaluated out of order) and other seasons continue. `detail.lastState` carries the SQLSTATE; `manager_card_rules_invalid` is a bad rules row. A statement timeout does not reach the job log: it fails the whole pg_cron run, which shows as `failed` in `cron.job_run_details`. |

`detail` is counts only, never a user id: `rulesVersion`, `gameweeks`, `teams`,
`cardsWritten`, `historyWritten`, `capMismatches` (weeks CAP skipped because the
captain on record disagreed with the scoring details; never guessed), `failed`,
`skipped`, `morePending`.

## Health checks

Read-only; run any of them at any time. They return aggregate figures and no
user ids.

```sql
-- The switches and the active rules.
select s.compute_enabled, s.read_enabled, s.updated_at,
  (select version from app_private.manager_card_rules where active) as active_rules
from app_private.manager_card_settings s;

-- The two jobs, their schedule and whether they are active.
select jobname, schedule, active from cron.job
where jobname in ('manager-card-tick', 'manager-card-history-prune');

-- Recent ticks as pg_cron saw them (failures and run time).
select status, start_time, end_time - start_time as took, left(return_message, 120) as message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'manager-card-tick')
order by start_time desc limit 10;

-- What the tick did.
select started_at, finished_at - started_at as took, outcome, detail
from app_private.manager_card_job_log order by id desc limit 20;

-- Gameweeks that are evaluable but not evaluated under the active rules.
select gw.sequence_number, gw.id as gameweek_id, gw.scoring_input_version
from app.fantasy_gameweeks gw
join app_private.fantasy_gameweek_postwork work
  on work.gameweek_id = gw.id and work.calculation_version = gw.scoring_input_version
  and work.completed_at is not null
where gw.status in ('finalized', 'corrected') and gw.points_state = 'final'
  and not exists (
    select 1 from app_private.manager_card_evaluations ev
    where ev.gameweek_id = gw.id and ev.scoring_input_version = gw.scoring_input_version
      and ev.rules_version = (select version from app_private.manager_card_rules where active))
order by gw.sequence_number;

-- How many cards, by tier, and how many are provisional (the shape to compare to the calibration).
select tier, provisional, count(*) from app.manager_card_seasons group by 1, 2 order by 1, 2;

-- Numbers: how many are assigned, how many retired. No user id in the second.
select count(serial) as assigned, count(*) filter (where founder_cohort is not null) as founders
from app.manager_cards;
select count(*) as retired from app_private.manager_card_retired_serials;
```

The same facts are in the ops health report as a check named `manager_card`
(counts only, no user id), added by `20261010120300` after `fantasy_progression`
(`20261009091728`, PR #384), so it is the last check in the report:

| Status | When                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ok     | Both switches off ("switched off"), or cards are current under the active rules.                                                                                                                                                                                                                                                                                   |
| warn   | Reads on but no usable rules (the section answers off); compute on but no usable rules.                                                                                                                                                                                                                                                                            |
| warn   | Reads on and compute off (cards are frozen).                                                                                                                                                                                                                                                                                                                       |
| warn   | A finished gameweek has waited more than 2 hours for its cards, or a tick error in the last 24 h.                                                                                                                                                                                                                                                                  |
| fail   | Compute on, rules usable, and a finished gameweek has waited more than 12 hours. This pages you.                                                                                                                                                                                                                                                                   |
|        | The wait counts from the latest of the gameweek's completion, the active rules row's creation and the last switch change, so switching compute on or activating rules never fails at once. While the last tick (under 30 minutes ago) said `more_pending` it is still catching up and the check warns instead. Gameweeks of cancelled Fantasy seasons are ignored. |

The watchdog does not require this check yet
(`REQUIRED_DATABASE_CHECKS` in `scripts/ops/watchdog.ts`); add it there once
production has the migration.

Signs of trouble: a tick `error` in the job log; `cron.job_run_details` showing
`failed`; the "evaluable but not evaluated" query returning rows for hours while
compute is on; the tier shares far from the aim (the scales were calibrated on
other data: a new rules version, not an edit).

## Load

The calculation re-reads every finished gameweek of the season for every team,
every time, rather than adding up (so a second run changes nothing). That makes
one evaluation **O(teams x gameweeks so far)**. Measured locally: about 5.5 s for
4,003 teams at 4 gameweeks. Extrapolated: roughly 10 minutes for 50,000 teams
by gameweek 38. The tick's statement timeout is 10 minutes
(`set local statement_timeout = '10min'`), so late in a large season one
gameweek's evaluation could hit it, and then the pg_cron run shows `failed`
(a statement timeout, SQLSTATE `57014`) in `cron.job_run_details`, with no
job-log row. **Watch the `took` column of the job log and of
`cron.job_run_details` as the season grows**; act when a single run passes
about 5 minutes: lower `batch_size` (new rules version), or ask for the
calculation to be split by team range (a code change, not a setting).

Also expect a heavy catch-up when a new rules version is activated or a
correction rewrites an early gameweek: the evaluations are redone from that
week on. Do it outside match days. While it runs, it holds the card lock for
the length of each tick, which the account erasure and the founder grant wait
for (they retry; nothing is lost).

## Latency

The budgets for the reads, as database time for one call:

| Call                                       | Budget |
| ------------------------------------------ | ------ |
| `api.manager_card_status()`                | 5 ms   |
| `api.get_my_manager_card()`                | 40 ms  |
| `api.get_manager_cards` with 100 team ids  | 80 ms  |
| `api.get_my_manager_card_history` (a page) | 20 ms  |
| `api.ack_manager_card_moments`             | 30 ms  |

The contract test (`scripts/backend/manager-card-contract-e2e.test.ts`) prints
the measured numbers on every run and checks the budgets when
`MANAGER_CARD_E2E_STRICT_TIMING=1`. Measured numbers (2026-10-09, the local
Supabase stack on the build machine, database time from `explain (analyze)`,
median of 9 runs with 100 extra managers loaded; these are local-stack numbers,
not production): `manager_card_status` 0.5 ms, `get_my_manager_card` 6.1 ms,
`get_manager_cards` of 100 ids 10.8 ms, `get_my_manager_card_history` (20 rows)
1.1 ms, `ack_manager_card_moments` 5.3 ms. The batch read was 205 ms for 100 ids
(median of 5, about 1 ms a team) before it was made set-based. Re-measure on
production after the apply and record it here. The status call is the one the website makes on every page load; if
it ever passes its budget, the website's 800 ms limit hides the section rather
than slow the page.

## Account deletion

Deleting an account (`docs/backend/ACCOUNT_DELETION_RUNBOOK.md`) removes the
card:

- the card rows (`app.manager_cards`, `app.manager_card_seasons`,
  `app.manager_card_gameweeks`) **cascade** from the profile, so no code has to
  remember to delete them;
- the card's **number is retired**: an AFTER DELETE trigger copies the serial,
  and nothing else, to `app_private.manager_card_retired_serials` (no user id,
  no link to the person). It is never issued again;
- the FOUNDER mark goes with the account;
- the rating changes (`app.manager_card_ovr_changes`, migration
  `20261012200100`) cascade from the profile too;
- the moments the user acknowledged (`app.manager_card_moment_acks`) go the same
  way, by cascade from the profile. Nothing is kept: they hold no number. They
  need no extra lock, because the tick never writes them and a user who is
  waiting to be erased cannot acknowledge anything;
- an account that is waiting to be erased (its profile has `deleted_at`) shows
  **no card** and is skipped by the tick;
- the erasure takes the card's lock (`botolago:manager-card`) without waiting,
  like the Fantasy, Pronostics, Pépites and prize locks. If the tick is mid-run
  it refuses with `account_deletion_writer_busy`, the worker releases the
  request, and the next hourly run erases it. So an erasure **waits for the card
  tick, and the tick never races an erasure**. A long catch-up (see "Load") can
  delay erasures by up to one tick at a time, not more.

## Production order

Do these in this order. Each step is the owner's, or done only with the owner's
authorisation, one step at a time (CLAUDE.md, "Production database writes").

1. **Already on production** as of 2026-10-08: `20261005130000` (public
   recaps) and `20261006143700` (automatic account deletion). The apply script
   refuses without them.
2. **This feature's apply script**,
   `scripts/backend/apply-20261008123000-manager-card.sql`, after the pull
   request is merged. Pause the Fantasy lifecycle tick first
   (`select app_private.fantasy_automation_configure(false);`) and switch it back
   on afterwards. Run it as a rehearsal ("Rehearsal passed"), then with
   `commit;` ("Applied"). It checks both switches are off, there is no rules
   row, the grants, the erase lock, both jobs, and that the tick answers `off`.
   **Then the six pull requests merged to main after #381 (seven
   migrations) go first, in this order,** each by its own guarded script (except
   (g), which has none), before the read API script below:
   (a) the Fantasy durable progression migration (PR #384),
   `scripts/backend/apply-fantasy-durable-progression.sql` (migration
   `20261009091728`, see `FANTASY_DURABLE_PROGRESSION_RUNBOOK.md`); then
   (b) Home stories (PR #386), `scripts/backend/apply-home-stories.sql`
   (migrations `20261009094920` and `20261009113132`, see `HOME_STORIES.md`); then
   (c) AI home stories (PR #389), `scripts/backend/apply-ai-home-stories.sql`
   (migration `20261009195943`, see `AI_HOME_STORIES.md`); then
   (d) the story presentation repair (PR #390),
   `scripts/backend/apply-story-presentation-repair.sql` (migration
   `20261009211234`, see `AI_HOME_STORIES.md`); then
   (e) the initial home stories refresh (also PR #390),
   `scripts/backend/refresh-initial-home-stories.sql`. It records no
   migration. Deploy the repaired worker and publish the website first, as
   `AI_HOME_STORIES.md` says, then rehearse it and commit it. The repair
   leaves the AI stories switch off (it verifies "install must leave
   paused"); the refresh queues the three original images, switches the
   stories back on with the six-attempt cap and runs one tick. It refuses
   unless there are exactly 171 recorded migrations, the newest is
   `20261009211234`, the switch is off at six attempts and there are exactly
   three story jobs and three stories in the feed. It has to run before (f).
   (f) needs the switch on at six attempts (« settings changed » otherwise),
   which only the refresh switches back on, and once (f) is recorded the
   refresh's 171-row and `20261009211234` pins refuse for good; then
   (f) the compact story labels (PR #393),
   `scripts/backend/apply-compact-story-labels.sql` (migration
   `20261010055425`, see `AI_HOME_STORIES.md`). Before it, wait until the
   three replacement images have finished generating: it also refuses while a
   story is still generating (« Edge worker not drained »); then
   (g) the removal of public AI notices (PR #396), migration
   `20261010073509` (`supabase/migrations/20261010073509_no_public_ai_notices.sql`).
   It has no apply script of its own: apply it through the reviewed migration
   path (`RELEASE_ACTIVATION_MIGRATION_RUNBOOK.md`), after (f) and before the
   read API script, which refuses until it is the newest recorded migration.
   PR #387 (AI content), PR #391 (story viewer) and PR #392 (story player) add no
   migration.
   The migrations go in repository order, and the four below are last:
   `20261009091728` replaces `app_private.ops_health_checks()` with a wrapper
   that adds `fantasy_progression`, and `20261010120300` wraps that wrapper to
   add `manager_card` last. Applied the other way round, #384's rename would
   take the Manager Card wrapper and put `fantasy_progression` after
   `manager_card`. Every migration script in the chain enforces the order by
   wanting its predecessor to be the newest recorded migration: #384's refuses unless that
   is `20261008123400`, Home stories' unless it is `20261009091728`, AI home
   stories' unless it is `20261009113132`, the repair's unless it is
   `20261009195943`, the compact story labels' unless it is `20261009211234`,
   and the read API script unless it is exactly `20261010073509` (the removal
   of public AI notices, PR #396, which has no apply script of its own). That
   comparison covers versions only: each earlier script's own preconditions
   (counts, switches, drained workers) still apply when you run it, and the
   refresh (e) records no migration, so the ledger cannot show whether it ran.
   Follow the order above and read each script's own header and guards. The AI home
   stories, repair, refresh and compact story labels scripts also pin the
   number of recorded migrations and call `app_private.hold_scheduled_jobs()`
   (they refuse while a scheduled job is mid-run). As written on `main` the
   counts do not chain at one point:
   Home stories' script expects 166 rows before and leaves 168, while AI home
   stories' wants exactly 169. From there they do: AI home stories wants 169
   and leaves 170, the repair wants 170 and leaves 171, the refresh wants 171
   and leaves 171, the compact story labels want 171 and leave 172, and (g) leaves 173. Before
   running AI home stories, read
   `select count(*), max(version) from supabase_migrations.schema_migrations;`
   and, if it refuses with « migration baseline changed », find out why with
   that script's owner. Never edit a guard to make it pass. The read API
   script below pins only the newest version, so it is not affected.
   **Production, as read on 2026-10-10:** the owner's read of production showed
   every earlier migration already applied (173 rows, newest
   `20261010073509`), so on production only this PR's apply script remains and
   (a) to (f) above are history there. The guard requires `20261010073509`;
   the file (`supabase/migrations/20261010073509_no_public_ai_notices.sql`) is on `main`, PR #396 having merged.
   **Then the read API apply script,**
   `scripts/backend/apply-20261010120000-manager-card-api-v2.sql` (migrations
   `20261010120000` to `20261010120300`). It changes nothing anyone sees: it
   refuses to run if the read switch is on, or if the newest recorded
   migration is not `20261010073509` (its message names the one it found and
   what to apply first). Rehearse, then `commit;`. It
   replaces the first read functions with the ones the Gradins screens call, and
   adds the status call, the acknowledgements and the health check. Do it before
   anything is switched on.
3. **Calibration and rules v1.** Owner-granted aggregate-only read, calibrate,
   set `cap_ignore_deadlines_before` to the day PR #376 shipped, insert version
   1 (see "Rules v1").
4. **The founder grant,** once, by the owner, after the cut-off, rehearsed
   first (see "The founder grant").
5. **Switches on.** Compute first (`manager_card_configure(true, null)`), wait for
   the tick, check the health queries and a few cards by hand, then read
   (`manager_card_configure(null, true)`). Reads on is the launch of Gradins
   (see "The app's switch"); `MANAGER_CARD_ENABLED` must be `true` in the
   published website too.

To turn it all back off at any point: `select
app_private.manager_card_configure(false, false);`. Nothing is lost; cards stay
in place and the reads answer off again. Gradins hides within about a minute.
